import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type GenerateKind = 'workout' | 'program' | 'meal_plan';

type GenerateBody = {
  kind?: GenerateKind;
  goal?: string;
  client?: string;
  level?: string;
  duration?: string;
  daysPerWeek?: number;
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
  const kind = ['workout', 'program', 'meal_plan'].includes(String(body.kind))
    ? body.kind
    : 'workout';
  return {
    ...body,
    kind,
    goal: String(body.goal || '').trim() || 'general fitness',
    client: String(body.client || '').trim() || 'Shape client',
    level: String(body.level || '').trim() || 'intermediate',
    duration: String(body.duration || '').trim() || (kind === 'workout' ? '60 minutes' : '4 weeks'),
    daysPerWeek: Number(body.daysPerWeek || (kind === 'workout' ? 1 : 4)),
    equipment: String(body.equipment || '').trim() || 'standard gym',
    preferences: String(body.preferences || '').trim(),
    calories: String(body.calories || '').trim(),
    protein: String(body.protein || '').trim(),
  };
}

function fallbackDraft(body: GenerateBody): GeneratedDraft {
  if (body.kind === 'meal_plan') {
    const cals = body.calories || '2100 kcal';
    const protein = body.protein || '150g protein';
    return {
      title: `${body.goal} fuel plan`,
      summary: `${body.duration} nutrition draft for ${body.client}. Built around ${cals}, ${protein}, simple prep, and coach-editable swaps.`,
      tag: 'NUTRITION',
      duration: body.duration || '7 days',
      blocks: [
        { label: '01', title: 'Breakfast base', detail: 'Greek yogurt bowl, oats, berries, chia', note: 'Prep 3 servings; swap lactose-free yogurt if needed.' },
        { label: '02', title: 'Lunch anchor', detail: 'Chicken rice bowl, greens, olive oil, salsa', note: 'Batch chicken and rice for the target number of days.' },
        { label: '03', title: 'Training snack', detail: 'Banana, whey or plant protein, rice cakes', note: 'Place 60-90 minutes before training.' },
        { label: '04', title: 'Dinner rotation', detail: 'Salmon or lean beef, potato, vegetables', note: 'Use carb portion to adjust total calories.' },
      ],
      coachNotes: [
        'Confirm allergies, food access, schedule, and medical constraints before sending.',
        'Edit portions to match the client macro target and weekly adherence data.',
      ],
      shoppingList: [
        { section: 'Protein', items: ['Greek yogurt', 'Chicken breast', 'Salmon or lean beef', 'Whey or plant protein'] },
        { section: 'Carbs', items: ['Oats', 'Rice', 'Potatoes', 'Bananas', 'Rice cakes'] },
        { section: 'Produce', items: ['Berries', 'Greens', 'Mixed vegetables', 'Salsa'] },
      ],
    };
  }

  if (body.kind === 'program') {
    const days = Math.max(2, Math.min(Number(body.daysPerWeek || 4), 6));
    return {
      title: `${body.goal} block`,
      summary: `${body.duration} ${body.level} program for ${body.client}, built for ${days} sessions per week with ${body.equipment}.`,
      tag: String(body.goal || 'PROGRAM').toUpperCase().slice(0, 14),
      duration: body.duration || '4 weeks',
      blocks: [
        { label: 'W1', title: 'Base week', detail: `${days} sessions - technical volume`, note: 'Keep main lifts around RPE 6-7.' },
        { label: 'W2', title: 'Build week', detail: `${days} sessions - add load or reps`, note: 'Progress only if bar speed and recovery hold.' },
        { label: 'W3', title: 'Peak week', detail: `${days} sessions - highest workload`, note: 'Cap accessories before fatigue bleeds into main work.' },
        { label: 'W4', title: 'Deload/test', detail: `${Math.max(days - 1, 2)} sessions - reduce volume`, note: 'Retest one key metric and set the next block.' },
      ],
      coachNotes: [
        'Review injury history and equipment access before assigning.',
        'Customize exercise substitutions and load targets per client.',
      ],
      shoppingList: [],
    };
  }

  return {
    title: `${body.goal} session`,
    summary: `${body.duration} ${body.level} workout for ${body.client} using ${body.equipment}.`,
    tag: String(body.goal || 'WORKOUT').toUpperCase().slice(0, 14),
    duration: body.duration || '60 minutes',
    blocks: [
      { label: 'A', title: 'Warm-up', detail: '8 min movement prep + ramp sets', note: 'Keep nasal breathing and clean positions.' },
      { label: 'B', title: 'Primary lift', detail: '4 x 5 @ RPE 7', note: 'Stop one rep before form breakdown.' },
      { label: 'C1', title: 'Accessory superset', detail: '3 x 10-12 each', note: 'Controlled eccentric, short rest.' },
      { label: 'D', title: 'Finisher', detail: '6 min easy-hard intervals', note: 'Match intensity to recovery score.' },
    ],
    coachNotes: [
      'Edit loads, substitutions, and rest based on the client readiness data.',
      'Add video cues before sending if this is a technical session.',
    ],
    shoppingList: [],
  };
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of parts) {
    const content = Array.isArray(item?.content) ? item.content : [];
    const text = content.find((part: any) => part?.type === 'output_text')?.text;
    if (typeof text === 'string') return text;
  }
  return '';
}

async function generateWithOpenAI(body: GenerateBody): Promise<GeneratedDraft | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

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
            'You generate coach-editable fitness and nutrition drafts. Return only JSON that matches the schema. Be specific, practical, and safe. Include a note to verify medical constraints when relevant.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: `Generate a ${body.kind} draft for Shape coaches to edit before sending to a client.`,
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
    }),
  });

  if (!response.ok) {
    console.warn('[shape-app] OpenAI generation failed:', await response.text());
    return null;
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  if (!text) return null;
  return JSON.parse(text) as GeneratedDraft;
}

export async function POST(request: Request) {
  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

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
