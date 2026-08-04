import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';
import { callAI, hasOpenAIKey } from '@/lib/ai';
import { requireMembership } from '@/lib/require-membership';
// ONE implementation of the meal-slot / calorie split, shared with the
// nutritionist builder that renders the same template client-side — the
// established pattern in this repo (see food-search, self-training,
// trainer/adjust), and the reason the server and the builder cannot describe
// two different days.
import { bsMealSlots, bsMealCalories, BS_MEAL_FOOD } from '../../../../../mobile-app/src/services/planOutline.mjs';

export const runtime = 'nodejs';

// ⚠ SIX modes, not three.
//
// This used to be `workout | program | meal_plan`, with `cleanBody` silently
// coercing anything else to `workout`. The two coach builders between them have
// six kinds and passed them raw, so FOUR of the six asked for the wrong
// artifact: the nutritionist's `mealplan` and `diet` both generated STRENGTH
// WORKOUTS, `plan` asked for a single session instead of a multi-week block,
// and `meal_plan` — the one nutrition mode this route implemented — was
// unreachable from any interface.
//
// `program` is genuinely overloaded and is therefore split: a trainer program
// is a weekly split (Mon…Sun), a nutrition program is a multi-week arc
// (Week 1…N). They are different modes because they PARSE differently
// downstream. See `bsDraftMode` in mobile-app/src/services/planOutline.mjs,
// which is the client half of this contract.
type GenerateKind =
  | 'workout'
  | 'training_program'
  | 'training_plan'
  | 'meal_plan'
  | 'nutrition_program'
  | 'diet';

const GENERATE_KINDS: GenerateKind[] = [
  'workout',
  'training_program',
  'training_plan',
  'meal_plan',
  'nutrition_program',
  'diet',
];

// Back-compat for the three names this route accepted before the split. Only
// `program` is ambiguous; it resolves to the trainer meaning, which is what the
// sole legacy caller sent.
const LEGACY_KIND: Record<string, GenerateKind> = {
  workout: 'workout',
  program: 'training_program',
  meal_plan: 'meal_plan',
};

const NUTRITION_KINDS = new Set<GenerateKind>(['meal_plan', 'nutrition_program', 'diet']);

type GenerateBody = {
  kind?: GenerateKind;
  goal?: string;
  client?: string;
  level?: string;
  duration?: string;
  daysPerWeek?: number;
  mealsPerDay?: number;
  equipment?: string;
  preferences?: string;
  calories?: string;
  protein?: string;
};

type DraftBlock = {
  label: string;
  title: string;
  detail: string;
  note: string;
};

type GeneratedDraft = {
  title: string;
  summary: string;
  tag: string;
  duration: string;
  blocks: DraftBlock[];
  coachNotes: string[];
  shoppingList?: { section: string; items: string[] }[];
};

type OpenAIContentPart = {
  type?: string;
  text?: string;
};

type OpenAIOutputItem = {
  content?: OpenAIContentPart[];
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: OpenAIOutputItem[];
};

const draftSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'tag', 'duration', 'blocks', 'coachNotes', 'shoppingList'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    tag: { type: 'string' },
    duration: { type: 'string' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'title', 'detail', 'note'],
        properties: {
          label: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    coachNotes: {
      type: 'array',
      items: { type: 'string' },
    },
    shoppingList: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['section', 'items'],
        properties: {
          section: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

function cleanBody(value: unknown): GenerateBody {
  const body = value && typeof value === 'object' ? (value as GenerateBody) : {};
  const raw = String(body.kind || '');
  // Exact match first, then the legacy alias table. Still defaults rather than
  // rejecting — but the default is now only reachable by a caller sending a
  // name in neither set, instead of by four real builder kinds.
  const kind: GenerateKind = (GENERATE_KINDS as string[]).includes(raw)
    ? (raw as GenerateKind)
    : LEGACY_KIND[raw] || 'workout';
  const isNutrition = NUTRITION_KINDS.has(kind);
  return {
    ...body,
    kind,
    goal: String(body.goal || '').trim() || (isNutrition ? 'general nutrition' : 'general fitness'),
    client: String(body.client || '').trim() || 'Shape client',
    level: String(body.level || '').trim() || 'intermediate',
    duration: String(body.duration || '').trim() || (kind === 'workout' ? '60 minutes' : '4 weeks'),
    daysPerWeek: Number(body.daysPerWeek || (kind === 'workout' ? 1 : 4)),
    // Clamped to the chip range the nutritionist builder offers (3-6). The
    // template used to ignore this value entirely and always emit five meals.
    mealsPerDay: Math.max(3, Math.min(Number(body.mealsPerDay) || 4, 6)),
    equipment: String(body.equipment || '').trim() || 'standard gym',
    preferences: String(body.preferences || '').trim(),
    calories: String(body.calories || '').trim(),
    protein: String(body.protein || '').trim(),
  };
}

// ⚠ THE BLOCK TEXT IS PARSED DOWNSTREAM — this is the load-bearing half of the
// prompt, not styling.
//
// The coach edits these blocks and publishes them; at ASSIGN time the client
// app reads each block back with `bsAssignDayLine` / `bsAssignWeekLine` /
// `bsAssignMeal` / `bsAssignExercise` to decide what the plan even IS. A model
// that writes "Monday: upper body push" where the grammar wants "Mon — Upper
// (push)" produces a draft that publishes cleanly and then mis-assigns,
// silently. The client validates with those same parsers and falls back to its
// template if this instruction was not followed, so the worst case is the old
// behaviour — but getting it right here is what makes the feature work at all.
function blockGrammar(body: GenerateBody): string {
  switch (body.kind) {
    case 'training_program':
      return [
        'Each block is ONE WEEKDAY of a repeating weekly split.',
        'Emit exactly 7 blocks in order.',
        '`title` MUST be exactly one of: Mon, Tue, Wed, Thu, Fri, Sat, Sun (that abbreviation, nothing else).',
        '`detail` is that day\'s session, e.g. "Upper (push)" or "Rest / mobility".',
      ].join(' ');
    case 'training_plan':
      return [
        'Each block is ONE WEEK of a multi-week block.',
        '`title` MUST be exactly "Week N" (e.g. "Week 1"), numbered from 1 with no gaps.',
        '`detail` is that week\'s emphasis, e.g. "Accumulation" or "Deload / retest".',
      ].join(' ');
    case 'nutrition_program':
      return [
        'Each block is ONE WEEK of a multi-week nutrition arc.',
        '`title` MUST be exactly "Week N" (e.g. "Week 1"), numbered from 1 with no gaps.',
        '`detail` is that week\'s emphasis, e.g. "Reset & habits" or "Dial macros".',
      ].join(' ');
    case 'meal_plan':
      return [
        `Each block is ONE MEAL of a single day. Emit exactly ${body.mealsPerDay} blocks.`,
        '`title` MUST START with one of: Breakfast, Lunch, Dinner, Snack.',
        'Use Snack for any additional meals; you may repeat Snack.',
        'Order them as they are eaten across the day.',
        '`detail` names the food and MUST end with the calories in the form "· 420 kcal".',
        `The block calories MUST sum to approximately ${body.calories || '2100'} kcal for the day.`,
      ].join(' ');
    case 'diet':
      return [
        'Each block is a CATEGORY of options, not a single meal.',
        '`title` is the category, e.g. "Breakfast options" or "Foods to avoid".',
        '`detail` is a short comma-separated list of examples.',
      ].join(' ');
    default:
      return [
        'Each block is ONE EXERCISE of a single session, in the order performed.',
        '`title` is the movement name only, e.g. "Back squat".',
        '`detail` is the prescription, e.g. "4 × 6 · RPE 8".',
      ].join(' ');
  }
}

const WEEK_ARC = ['Accumulation', 'Accumulation', 'Intensification', 'Deload', 'Peak', 'Retest'];
const NUTRITION_ARC = ['Reset & habits', 'Build routine', 'Dial macros', 'Lock it in'];

function fallbackDraft(body: GenerateBody): GeneratedDraft {
  const goal = body.goal || 'general';
  const tag = String(goal).toUpperCase().slice(0, 14);

  // ⚠ Every template below emits blocks in the SAME grammar the prompt asks the
  // model for, so the server fallback survives the client's parser check
  // instead of being rejected and replaced by a second copy of itself.
  if (body.kind === 'meal_plan') {
    const slots: string[] = bsMealSlots(Number(body.mealsPerDay) || 4);
    const total = Number(String(body.calories || '').replace(/[^\d]/g, '')) || 2100;
    const kcal: number[] = bsMealCalories(total, slots);
    // Shared with the builder's own template — a second copy here is exactly
    // how the server and the client end up describing different days.
    const food = BS_MEAL_FOOD as Record<string, string>;
    return {
      title: `${goal} fuel plan`,
      summary: `${body.duration} nutrition draft for ${body.client}. Built around ${total} kcal across ${slots.length} meals, simple prep, and coach-editable swaps.`,
      tag: 'NUTRITION',
      duration: body.duration || '7 days',
      blocks: slots.map((slot, i) => ({
        label: String(i + 1).padStart(2, '0'),
        title: slot,
        detail: `${food[slot]} · ${kcal[i]} kcal`,
        note: 'Swap freely — keep the calorie target.',
      })),
      coachNotes: [
        'Confirm allergies, food access, schedule, and medical constraints before sending.',
        'Edit portions to match the client macro target and weekly adherence data.',
      ],
      shoppingList: [
        { section: 'Protein', items: ['Greek yogurt', 'Chicken breast', 'Salmon or lean beef', 'Whey or plant protein'] },
        { section: 'Carbs', items: ['Oats', 'Rice', 'Potatoes', 'Bananas'] },
        { section: 'Produce', items: ['Berries', 'Greens', 'Mixed vegetables'] },
      ],
    };
  }

  if (body.kind === 'nutrition_program') {
    return {
      title: `${goal} nutrition block`,
      summary: `${body.duration} nutrition arc for ${body.client}.`,
      tag,
      duration: body.duration || '4 weeks',
      blocks: NUTRITION_ARC.map((phase, i) => ({
        label: `W${i + 1}`,
        title: `Week ${i + 1}`,
        detail: phase,
        note: 'Adjust the emphasis to the client\'s adherence data.',
      })),
      coachNotes: ['Confirm allergies and medical constraints before sending.'],
      shoppingList: [],
    };
  }

  if (body.kind === 'diet') {
    return {
      title: `${goal} diet`,
      summary: `${body.level} diet options for ${body.client}.`,
      tag: 'DIET',
      duration: body.duration || '7 days',
      blocks: [
        { label: '01', title: 'Breakfast options', detail: 'Oats, eggs, Greek yogurt', note: '' },
        { label: '02', title: 'Lunch options', detail: 'Chicken bowls, salads, wraps', note: '' },
        { label: '03', title: 'Dinner options', detail: 'Salmon, lean beef, tofu stir-fry', note: '' },
        { label: '04', title: 'Snacks', detail: 'Fruit, nuts, protein shake', note: '' },
        { label: '05', title: 'Foods to favour', detail: 'Whole grains, lean protein, vegetables', note: '' },
        { label: '06', title: 'Foods to avoid', detail: 'Fried food, sugary drinks', note: '' },
      ],
      coachNotes: ['Confirm allergies and food access before sending.'],
      shoppingList: [],
    };
  }

  if (body.kind === 'training_program') {
    const days = Math.max(2, Math.min(Number(body.daysPerWeek || 4), 6));
    const split = ['Upper (push)', 'Lower (squat)', 'Rest / mobility', 'Upper (pull)', 'Lower (hinge)', 'Conditioning', 'Rest'];
    return {
      title: `${goal} split`,
      summary: `${body.level} weekly split for ${body.client}, ${days} sessions with ${body.equipment}.`,
      tag,
      duration: body.duration || '1 week',
      blocks: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({
        label: day.toUpperCase(),
        title: day,
        detail: split[i],
        note: '',
      })),
      coachNotes: [
        'Review injury history and equipment access before assigning.',
        'Customize exercise substitutions and load targets per client.',
      ],
      shoppingList: [],
    };
  }

  if (body.kind === 'training_plan') {
    return {
      title: `${goal} block`,
      summary: `${body.duration} ${body.level} block for ${body.client} with ${body.equipment}.`,
      tag,
      duration: body.duration || '6 weeks',
      blocks: WEEK_ARC.map((phase, i) => ({
        label: `W${i + 1}`,
        title: `Week ${i + 1}`,
        detail: phase,
        note: i === 3 ? 'Reduce volume; keep intensity honest.' : '',
      })),
      coachNotes: [
        'Review injury history and equipment access before assigning.',
        'Retest one key metric at the end and set the next block.',
      ],
      shoppingList: [],
    };
  }

  return {
    title: `${goal} session`,
    summary: `${body.duration} ${body.level} workout for ${body.client} using ${body.equipment}.`,
    tag,
    duration: body.duration || '60 minutes',
    blocks: [
      { label: 'A', title: 'Warm-up', detail: '8 min movement prep + ramp sets', note: 'Keep nasal breathing and clean positions.' },
      { label: 'B', title: 'Primary lift', detail: '4 × 5 · RPE 7', note: 'Stop one rep before form breakdown.' },
      { label: 'C', title: 'Secondary compound', detail: '4 × 8', note: '' },
      { label: 'D', title: 'Accessory superset', detail: '3 × 12', note: 'Controlled eccentric, short rest.' },
      { label: 'E', title: 'Finisher', detail: '6 min easy-hard intervals', note: 'Match intensity to recovery score.' },
    ],
    coachNotes: [
      'Edit loads, substitutions, and rest based on the client readiness data.',
      'Add video cues before sending if this is a technical session.',
    ],
    shoppingList: [],
  };
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of parts) {
    const content = Array.isArray(item?.content) ? item.content : [];
    const text = content.find((part) => part?.type === 'output_text')?.text;
    if (typeof text === 'string') return text;
  }
  return '';
}

async function generateWithOpenAI(body: GenerateBody): Promise<GeneratedDraft | null> {
  if (!hasOpenAIKey()) return null;

  const result = await callAI(
    {
      input: [
        {
          role: 'system',
          content: [
            'You generate coach-editable fitness and nutrition drafts.',
            'Return only JSON that matches the schema. Be specific, practical, and safe.',
            'Include a note to verify medical constraints when relevant.',
            'This is a STARTING TEMPLATE a human coach will edit and personalise before any client sees it — favour a clear, conventional structure over cleverness.',
            'The `title` and `detail` of each block are CONCATENATED as "title — detail" and then machine-parsed, so follow the block rules exactly. Put no other separator in `title`.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: `Generate a ${body.kind} draft for Shape coaches to edit before sending to a client.`,
            blockRules: blockGrammar(body),
            body,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'shape_plan_draft',
          strict: true,
          schema: draftSchema,
        },
      },
    },
    { promptId: 'ai.generate-plan' },
  );

  if (!result.ok) return null;

  const text = extractOutputText(result.data as OpenAIResponsePayload);
  if (!text) return null;
  return JSON.parse(text) as GeneratedDraft;
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  // Gate the OpenAI proxy behind an authenticated session — the plan
  // generator is only reached from signed-in coach surfaces, and an open
  // endpoint would let anyone burn the server's OpenAI key.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const jsonResult = await readJson<unknown>(request, { allowEmpty: true });
  if (!jsonResult.ok) return jsonResult.response;
  const json = jsonResult.data;

  const body = cleanBody(json);
  const generated = await generateWithOpenAI(body).catch((error) => {
    console.warn('[shape-app] AI generator fallback used:', error);
    return null;
  });

  return NextResponse.json({
    source: generated ? 'openai' : 'template',
    draft: generated || fallbackDraft(body),
  });
}
