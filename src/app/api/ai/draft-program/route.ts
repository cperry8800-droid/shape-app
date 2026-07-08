// AI draft for the self-serve training builder. A coach-less member describes a
// goal ("first marathon Oct 12, 4 days/week"); this returns a STRUCTURED draft
// program in the exact shape the builder edits (weeks → days → typed moves).
// It writes NOTHING — the draft lands in the builder's week-by-week review and
// only persists when the member saves. Human-in-the-loop, like Nora's proposals.
//
// POST /api/ai/draft-program { goal, weeks, daysPerWeek, discipline, experience }
//   → { program: { name, discipline, weeks: [...] } | null, source }
//
// The /api/ai prefix is already membership-gated in the proxy; this also requires
// an authenticated user so an open endpoint can't burn the OpenAI key.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { callAI, hasOpenAIKey } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAP = 182;         // weeks × days-per-week ceiling (matches the builder)
const MAX_WEEKS = 26;

type Move = { name: string; sets: string; reps: string; load: string; seg: string };
type Day = { dow: number; title: string; moves: Move[] };
type Week = { week: number; days: Day[] };
type Program = { name: string; discipline: string; weeks: Week[] };

type Body = { goal?: string; weeks?: number; daysPerWeek?: number; discipline?: string; experience?: string };

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIOutputItem = { content?: OpenAIContentPart[] };
type OpenAIResponsePayload = { output_text?: string; output?: OpenAIOutputItem[] };

// Strict json_schema: every property required, additionalProperties:false. A
// move carries all four fields (empty string when N/A) so strict mode is happy;
// the builder reads seg (segment) vs sets/reps (lift).
const moveSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'sets', 'reps', 'load', 'seg'],
  properties: {
    name: { type: 'string' },
    sets: { type: 'string' },
    reps: { type: 'string' },
    load: { type: 'string' },
    seg: { type: 'string' },
  },
};
const programSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'discipline', 'weeks'],
  properties: {
    name: { type: 'string' },
    discipline: { type: 'string' },
    weeks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['week', 'days'],
        properties: {
          week: { type: 'integer' },
          days: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['dow', 'title', 'moves'],
              properties: {
                // OpenAI strict Structured Outputs rejects minimum/maximum — the
                // 0..6 range is enforced in sanitize() after parsing instead.
                dow: { type: 'integer' },
                title: { type: 'string' },
                moves: { type: 'array', items: moveSchema },
              },
            },
          },
        },
      },
    },
  },
};

function cleanBody(value: unknown): Required<Body> {
  const b = value && typeof value === 'object' ? (value as Body) : {};
  const weeks = Math.max(1, Math.min(MAX_WEEKS, Math.round(Number(b.weeks) || 8)));
  const daysPerWeek = Math.max(1, Math.min(7, Math.round(Number(b.daysPerWeek) || 4)));
  return {
    goal: String(b.goal || '').trim().slice(0, 300) || 'general fitness',
    weeks,
    daysPerWeek,
    discipline: String(b.discipline || '').trim() || 'run',
    experience: String(b.experience || '').trim() || 'intermediate',
  };
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of parts) {
    const content = Array.isArray(item?.content) ? item.content : [];
    const text = content.find((p) => p?.type === 'output_text')?.text;
    if (typeof text === 'string') return text;
  }
  return '';
}

// Clamp to the requested length + the row cap; drop malformed weeks/days.
function sanitize(program: Program | null, body: Required<Body>): Program | null {
  if (!program || !Array.isArray(program.weeks)) return null;
  const weeks = program.weeks
    .slice(0, body.weeks)
    .map((wk, i): Week => ({
      week: i + 1,
      days: (Array.isArray(wk.days) ? wk.days : [])
        .filter((d) => d && Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6)
        .slice(0, 7)
        .map((d): Day => ({
          dow: d.dow,
          title: String(d.title || 'Session').slice(0, 60),
          moves: (Array.isArray(d.moves) ? d.moves : []).slice(0, 12).map((m): Move => ({
            name: String(m?.name || '').slice(0, 80),
            sets: String(m?.sets || ''),
            reps: String(m?.reps || ''),
            load: String(m?.load || ''),
            seg: String(m?.seg || ''),
          })).filter((m) => m.name),
        })),
    }))
    .filter((wk) => wk.days.length);
  if (!weeks.length) return null;
  const maxDays = Math.max(...weeks.map((wk) => wk.days.length));
  if (weeks.length * maxDays > CAP) {
    // Over the ceiling — trim weeks until it fits (never silently oversize).
    const fitWeeks = Math.max(1, Math.floor(CAP / Math.max(1, maxDays)));
    return { name: String(program.name || 'My program').slice(0, 80), discipline: String(program.discipline || body.discipline), weeks: weeks.slice(0, fitWeeks) };
  }
  return { name: String(program.name || 'My program').slice(0, 80), discipline: String(program.discipline || body.discipline), weeks };
}

async function draftWithOpenAI(body: Required<Body>): Promise<Program | null> {
  if (!hasOpenAIKey()) return null;
  const result = await callAI(
    {
      input: [
        {
          role: 'system',
          content:
            'You generate a safe, progressive training schedule a member will review and EDIT before using. Return only JSON matching the schema. Build then taper for endurance goals; include easy/recovery days; a move is EITHER a lift (fill sets+reps, leave seg empty) OR a segment like a run/ride/swim leg or a conditioning station (fill seg like "10 mi · Z2", leave sets/reps empty). Respect the requested number of weeks and days per week. dow is 0=Mon..6=Sun.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Draft a training program for a self-coached member.',
            goal: body.goal, weeks: body.weeks, daysPerWeek: body.daysPerWeek,
            discipline: body.discipline, experience: body.experience,
          }),
        },
      ],
      text: { format: { type: 'json_schema', name: 'shape_training_program', strict: true, schema: programSchema } },
    },
    { promptId: 'ai.draft-program' },
  );
  if (!result.ok) return null;
  const text = extractOutputText(result.data as OpenAIResponsePayload);
  if (!text) return null;
  try { return JSON.parse(text) as Program; } catch { return null; }
}

export async function POST(request: Request) {
  // Cookie (web) OR Bearer (native app) — the native builder sends Bearer, so a
  // cookie-only client would 401 every mobile draft. currentUser handles both.
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<unknown>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const body = cleanBody(parsed.data);

  const raw = await draftWithOpenAI(body).catch((e) => { console.warn('[shape-app] draft-program failed:', e); return null; });
  const program = sanitize(raw, body);
  // Honest failure — never a silently-empty program the builder would render blank.
  if (!program) return NextResponse.json({ program: null, source: 'unavailable' });
  return NextResponse.json({ program, source: 'openai' });
}
