// Shape in-app support assistant (Nora).
//
// POST /api/support/chat  { messages: [{ role: 'user'|'assistant', content }] }
//   → { reply, source: 'ai' | 'fallback', actions?: SupportAction[] }
//
// Nora is grounded with TOOLS (OpenAI function calling) so she can do real
// work instead of only talking about it. Today she can look up and recommend
// actual coaches from the catalog (`recommend_coaches`); the matched coaches
// also come back as `actions` (reliable deep-links built server-side, never
// hallucinated) that the mobile app + website render as tappable chips.
//
// The AI call uses the same OPENAI_API_KEY / OPENAI_MODEL as the rest of the
// app. If the key is unset or the model errors we fall back to a rule-based
// responder that still surfaces coach actions for coach-related questions.

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { callAI, hasOpenAIKey } from '@/lib/ai';
import { rankCoaches, coachUrl, type Coach, type CoachRole } from '@/lib/coach-catalog';
import { proposeChange } from '@/lib/ai/proposals.mjs';
import { resolveActor, makeCtx, serverRegistry, proposalSecret } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Structured, tappable follow-ups the client renders under Nora's reply.
//   - 'coach'       → a specific coach detail page (web url) / marketplace (mobile)
//   - 'marketplace' → open the marketplace, optionally filtered to a role
//   - 'screen'      → an in-app destination (settings/integrations/billing/pricing)
type SupportAction =
  | { type: 'coach'; label: string; role: CoachRole; slug: string; url: string; meta?: string }
  | { type: 'marketplace'; label: string; role?: CoachRole; url: string }
  | { type: 'screen'; label: string; screen: string; url?: string }
  // A previewed, NOT-yet-applied change: the client renders the diff + a Confirm
  // button that POSTs the token to /api/ai/proposals/confirm. Nothing happens
  // until the human confirms.
  | { type: 'proposal'; label: string; summary: string; diff: Array<{ label?: string; before?: unknown; after?: unknown }>; token: string; action: string };

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIOutputItem = {
  type?: string;
  content?: OpenAIContentPart[];
  // function_call item fields
  call_id?: string;
  name?: string;
  arguments?: string;
};
type OpenAIResponsePayload = { output_text?: string; output?: OpenAIOutputItem[] };

const SYSTEM_PROMPT = [
  "You are Nora, Shape's in-app support assistant. Introduce yourself as Nora if asked your name.",
  'Shape is a fitness and nutrition coaching app where members train, log meals/habits, track a Shape Score, and work with a real human coach.',
  'Be warm, concise (1-4 sentences), specific, and action-oriented — actually help, do not just describe where to look.',
  '',
  'COACHES: When a member wants to find, switch, compare, or get matched with a coach (trainer or nutritionist), CALL the recommend_coaches tool and then recommend specific people by name with one short reason each (specialty, city, or rating). Ask at most ONE clarifying question (e.g. goal, in-person vs remote) only if you truly cannot pick a sensible focus; otherwise just recommend. Never invent coaches — only mention ones the tool returns.',
  '',
  "ACTIONS: You can DO things, not just explain them. To log a meal for the signed-in member onto today's nutrition, call log_meal (calories/protein/carbs/fat/water). For a COACH on their OWN client: set_client_goal (any coach), assign_workout (trainers), assign_meal_plan (nutritionists), set_program_detail (program phase/note — a trainer's training block or a nutritionist's nutrition phase), add_review_note (feedback on a logged session), reschedule_session (move one of their coaching sessions). These DRAFT a change the user must CONFIRM — so never say it's done; say you've drafted it and they can review & confirm below. NEVER guess an unmatched client — if you don't have the client, ask for the name. NEVER invent a value, workout, or meal the user didn't give. The server only lets a coach act on a client they actively coach, in their own discipline — if a tool returns an error message, relay it plainly.",
  '',
  'OTHER FIRST-LINE HELP: account & login, billing/subscription ($5/mo platform membership; coaches set their own coaching prices), connecting integrations (Spotify, Strava, Whoop, Oura, Garmin, Apple Health, Instacart), and using the Train/Eat/Habits/Score/Radio tabs, channels & chat.',
  'Never invent policy, prices, or medical advice. If something needs a human — refunds, account changes, data deletion, a confirmed bug, or anything you are unsure about — say you have flagged it for the Shape team and they will follow up here. Do not promise specific timelines.',
].join('\n');

const TOOLS = [
  {
    type: 'function',
    name: 'recommend_coaches',
    description:
      "Search Shape's coach catalog and return specific coaches that match the member's goal/specialty/location/format. Call this for any request to find, switch, compare, or get matched with a trainer or nutritionist.",
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['trainer', 'nutritionist', 'any'],
          description: "Which kind of coach. Use 'nutritionist' for diet/meal/macro help, 'trainer' for training, 'any' if unclear.",
        },
        focus: {
          type: 'string',
          description: "Free-text of what they want, e.g. 'fat loss', 'marathon', 'postpartum', 'strength in Brooklyn', 'remote vegan nutrition'. Empty for a general top-rated list.",
        },
        limit: { type: 'integer', description: 'How many to return (1-5). Default 3.' },
      },
      required: ['role', 'focus', 'limit'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'log_meal',
    description:
      "Log a meal for the SIGNED-IN member onto today's nutrition. Use when they say they ate something (with calories/protein/carbs/fat) or want to log water. Pass only the values they gave — never invent numbers. This DRAFTS the change for the member to confirm; it is not applied until they approve.",
    parameters: {
      type: 'object',
      properties: {
        mealName: { type: 'string', description: "Short label, e.g. 'lunch', 'chicken bowl'." },
        kcal: { type: 'number', description: 'Calories.' },
        protein: { type: 'number', description: 'Protein in grams.' },
        carbs: { type: 'number', description: 'Carbs in grams.' },
        fat: { type: 'number', description: 'Fat in grams.' },
        hydrationL: { type: 'number', description: 'Water in litres.' },
      },
      required: ['mealName'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'set_client_goal',
    description:
      "Set or update a goal for one of the COACH's own clients (coaches only). Use when a coach says e.g. 'set Priya's goal weight to 145 lb'. Always pass clientName; pass clientId only if you already have the client's id. DRAFTS the change for the coach to confirm. If you cannot identify the client, ask — do not guess.",
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: "The client's name as the coach referred to them." },
        clientId: { type: 'string', description: "The client's user id, if known from context." },
        goal: {
          type: 'object',
          properties: {
            label: { type: 'string', description: "e.g. 'Goal weight', 'Bench 1RM'." },
            target: { type: 'number', description: 'The target value.' },
            unit: { type: 'string', description: "e.g. 'lb', 'kg', '%'." },
            metric: { type: 'string' },
            start: { type: 'number' },
          },
        },
      },
      required: ['clientName', 'goal'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'assign_workout',
    description:
      "Assign a workout to one of the TRAINER's own clients (trainers only). Use when a trainer says e.g. 'give Priya the upper-body session on Monday'. Always pass clientName; pass clientId only if known. Pass a title; scheduledDate (YYYY-MM-DD) if they named a day. DRAFTS the change for the trainer to confirm. If you cannot identify the client, ask — do not guess. The server rejects any client who isn't actively coached by this trainer.",
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: "The client's name as the trainer referred to them." },
        clientId: { type: 'string', description: "The client's user id, if known from context." },
        title: { type: 'string', description: "The workout title, e.g. 'Upper body — push'." },
        scheduledDate: { type: 'string', description: 'The day to schedule it, YYYY-MM-DD, if given.' },
        description: { type: 'string', description: 'Optional note to the client.' },
      },
      required: ['clientName', 'title'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'assign_meal_plan',
    description:
      "Assign a weekly meal plan to one of the NUTRITIONIST's own clients (nutritionists only). Use when a nutritionist hands a client a plan. Always pass clientName; pass clientId only if known; pass a title and the days array. NEVER invent the meals — only assign days the nutritionist actually provided. DRAFTS the change for the nutritionist to confirm. If you cannot identify the client, ask. The server rejects any client who isn't actively coached by this nutritionist.",
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: "The client's name as the nutritionist referred to them." },
        clientId: { type: 'string', description: "The client's user id, if known from context." },
        title: { type: 'string', description: "The plan title, e.g. 'Cut · week 1'." },
        weekStart: { type: 'string', description: 'Week start date, YYYY-MM-DD, if given.' },
        days: { type: 'array', description: 'The plan days the nutritionist provided (their shape passes through).', items: { type: 'object' } },
      },
      required: ['clientName', 'title', 'days'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'set_program_detail',
    description:
      "Set a client's program phase and/or a coach note for the CALLER's own discipline (a trainer sets the training block; a nutritionist sets the nutrition phase). Use when a coach says e.g. 'move Priya to a peak block' or 'put Sam on a deload'. Always pass clientName; pass clientId only if known; pass phase (e.g. 'Peak', 'Deload', 'Cut') and/or a note. The server only lets a coach change their OWN discipline for a client they actively coach. DRAFTS the change for the coach to confirm.",
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: "The client's name as the coach referred to them." },
        clientId: { type: 'string', description: "The client's user id, if known from context." },
        phase: { type: 'string', description: "The program phase, e.g. 'Peak', 'Deload', 'Cut', 'Build'." },
        note: { type: 'string', description: 'An optional note to the client about the change.' },
      },
      required: ['clientName'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'add_review_note',
    description:
      "Add a coaching review note to a client's logged workout session (the CALLER must be the coach on that session). Use when a coach dictates feedback on a specific session. Pass the sessionId (the workout session's id, from context) and the note body verbatim. NEVER write the note for them — only use the coach's own words. visibility is 'client' (default), 'coach_private', or 'team'. DRAFTS the note for the coach to confirm.",
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: "The workout session's id." },
        body: { type: 'string', description: "The note text, in the coach's own words." },
        visibility: { type: 'string', enum: ['client', 'coach_private', 'team'], description: 'Who can see it. Default client.' },
      },
      required: ['sessionId', 'body'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'reschedule_session',
    description:
      "Move one of the COACH's coaching sessions to a new time (the caller must be the coach on it; only an upcoming/confirmed session can move). Use when a coach says e.g. 'push my 3pm with Priya to Thursday'. Pass the sessionId, a date (YYYY-MM-DD) and optional time (HH:MM). If you don't have the session id, ask — do not guess. DRAFTS the move for the coach to confirm.",
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The coaching session id.' },
        date: { type: 'string', description: 'New date, YYYY-MM-DD.' },
        time: { type: 'string', description: 'New time, HH:MM (24h), if given.' },
      },
      required: ['sessionId', 'date'],
      additionalProperties: false,
    },
    strict: false,
  },
];

// The write tools that DRAFT a confirm-required change (vs. read tools that
// answer inline). Kept in sync with the registry's Tier-1/Tier-2 actions.
const WRITE_TOOLS = new Set(['log_meal', 'set_client_goal', 'assign_workout', 'assign_meal_plan', 'set_program_detail', 'add_review_note', 'reschedule_session']);

function coachLine(c: Coach): string {
  return `${c.name} — ${c.role}, ${c.city}. ${c.specialties.join(', ')}. ${c.cert}, ${c.years}y, ${c.format}. $${c.rate}/session, ★${c.rating}.`;
}

function actionForCoach(c: Coach): SupportAction {
  return {
    type: 'coach',
    label: `${c.name} →`,
    role: c.tag === 'Nutritionist' ? 'nutritionist' : 'trainer',
    slug: coachUrl(c).split('coach=')[1] || '',
    url: coachUrl(c),
    meta: `${c.role} · ★${c.rating}`,
  };
}

type ToolOut = { result: unknown; actions: SupportAction[] };
type ProposeFn = (name: string, args: Record<string, unknown>) => Promise<ToolOut>;

// Runs a tool call; returns { result (for the model), actions (for the UI) }.
// Read tools (recommend_coaches) run here; WRITE tools route through `propose`,
// which drafts a confirm-required change via the AI1 scaffold (never executes).
async function runTool(name: string, args: Record<string, unknown>, propose: ProposeFn): Promise<ToolOut> {
  if (WRITE_TOOLS.has(name)) {
    return propose(name, args);
  }
  if (name === 'recommend_coaches') {
    const role = (['trainer', 'nutritionist', 'any'].includes(String(args.role)) ? String(args.role) : 'any') as CoachRole | 'any';
    const focus = typeof args.focus === 'string' ? args.focus : '';
    const limit = typeof args.limit === 'number' ? args.limit : 3;
    const coaches = rankCoaches({ role, focus, limit });
    const actions: SupportAction[] = coaches.map(actionForCoach);
    // A "browse all" action so they can keep exploring.
    const browseRole = role !== 'any' ? role : undefined;
    actions.push({
      type: 'marketplace',
      label: browseRole ? `Browse all ${browseRole}s` : 'Browse the marketplace',
      role: browseRole,
      url: `/newdesign/Marketplace.html${browseRole ? `?role=${browseRole === 'nutritionist' ? 'Nutritionist' : 'Trainer'}` : ''}`,
    });
    return {
      result: {
        coaches: coaches.map((c) => ({
          name: c.name,
          role: c.role,
          kind: c.tag,
          city: c.city,
          specialties: c.specialties,
          cert: c.cert,
          years: c.years,
          format: c.format,
          rate: c.rate,
          rating: c.rating,
          summary: coachLine(c),
        })),
      },
      actions,
    };
  }
  return { result: { error: `Unknown tool ${name}` }, actions: [] };
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const parts = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of parts) {
    const content = Array.isArray(item?.content) ? item.content : [];
    const text = content.find((part) => part?.type === 'output_text')?.text;
    if (typeof text === 'string') return text;
  }
  return '';
}

// Build the WRITE-tool executor for this request: drafts a confirm-required
// change via the AI1 scaffold, carrying the ACTOR'S session (so the endpoint's
// auth + RLS stay the gate). Nothing is applied — the client confirms the
// returned token at /api/ai/proposals/confirm.
async function makePropose(request: Request): Promise<ProposeFn> {
  const actor = await resolveActor(request);
  return async (name, args) => {
    if (!actor) {
      return { result: { error: 'sign_in_required', message: 'They need to be signed in for me to do that.' }, actions: [] };
    }
    const secret = proposalSecret();
    if (!secret) return { result: { error: 'unavailable', message: 'Actions are not configured right now.' }, actions: [] };
    const res = await proposeChange({
      registry: serverRegistry,
      action: name,
      input: args,
      actor: { id: actor.user.id, role: actor.role },
      ctx: makeCtx(actor, request),
      secret,
    });
    if (!res.ok) {
      return { result: { error: res.error, message: (res as { message?: string }).message || null }, actions: [] };
    }
    const action: SupportAction = {
      type: 'proposal',
      label: 'Review & confirm',
      summary: res.preview.summary,
      diff: res.preview.diff,
      token: res.token,
      action: name,
    };
    return { result: { proposed: true, summary: res.preview.summary, requiresConfirm: true }, actions: [action] };
  };
}

async function askOpenAI(
  messages: ChatMessage[],
  propose: ProposeFn,
): Promise<{ reply: string; actions: SupportAction[] } | null> {
  if (!hasOpenAIKey()) return null;
  const recent = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  let input: unknown[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...recent];
  const actions: SupportAction[] = [];

  // Allow up to 2 tool rounds, then take the text.
  for (let round = 0; round < 3; round++) {
    const result = await callAI({ input, tools: TOOLS }, { promptId: 'support.chat' });
    if (!result.ok) return null;
    const payload = result.data as OpenAIResponsePayload;
    const output = Array.isArray(payload.output) ? payload.output : [];
    const calls = output.filter((o) => o.type === 'function_call');
    if (calls.length === 0 || round === 2) {
      const reply = extractOutputText(payload).trim();
      return reply ? { reply, actions } : null;
    }
    // Echo the model's function_call items back, then append our outputs.
    input = input.concat(output as unknown[]);
    for (const call of calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.arguments || '{}');
      } catch {
        parsed = {};
      }
      const { result, actions: a } = await runTool(String(call.name), parsed, propose);
      for (const act of a) actions.push(act);
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  return null;
}

// Rule-based first responder for when the model is unset/down. Still returns
// coach actions for coach questions so the experience degrades gracefully.
function fallbackReply(text: string): { reply: string; actions: SupportAction[] } {
  const q = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  if (has('spotify'))
    return { reply: "For Spotify: open Settings → Manage integrations → Connect Spotify. Once connected you can save a coach's playlist straight to your own profile.", actions: [{ type: 'screen', label: 'Open integrations', screen: 'integrations' }] };
  if (has('instacart', 'grocery'))
    return { reply: "Grocery hand-off to Instacart is rolling out — for now your grocery list copies to your clipboard so you can paste it into any store. I've noted your interest for the Shape team.", actions: [] };
  if (has('whoop', 'strava', 'oura', 'garmin', 'apple health', 'apple watch', 'wearable', 'sync'))
    return { reply: 'You can connect wearables under Settings → Manage integrations (Strava, Whoop, Oura, Garmin, and Apple Health on the iOS app). Recovery, sleep, and workouts then flow into your daily snapshot.', actions: [{ type: 'screen', label: 'Open integrations', screen: 'integrations' }] };
  if (has('password', 'log in', 'login', 'sign in', "can't get in", 'reset'))
    return { reply: "For login trouble, try resetting your password from the sign-in screen. If you still can't get in, tell me your account email and I'll flag it for the Shape team.", actions: [] };
  if (has('cancel', 'refund', 'billing', 'charge', 'subscription', 'payment'))
    return { reply: "I can't make billing changes from here, but I've flagged this for the Shape team — they'll follow up in this thread. If you can, add the date and amount you're asking about.", actions: [{ type: 'screen', label: 'See pricing', screen: 'pricing', url: '/newdesign/Pricing.html' }] };
  if (has('nutrition', 'diet', 'meal', 'macro', 'eat', 'vegan', 'plant')) {
    const coaches = rankCoaches({ role: 'nutritionist', focus: q, limit: 3 });
    const actions: SupportAction[] = coaches.map(actionForCoach);
    actions.push({ type: 'marketplace', label: 'Browse all nutritionists', role: 'nutritionist', url: '/newdesign/Marketplace.html?role=Nutritionist' });
    return { reply: `Here are a few nutritionists who could be a strong fit: ${coaches.map((c) => c.name).join(', ')}. Tap one to see their full profile, or browse them all.`, actions };
  }
  if (has('coach', 'trainer', 'find', 'match', 'strength', 'run', 'fat loss', 'lose weight', 'muscle', 'hyrox')) {
    const coaches = rankCoaches({ role: 'trainer', focus: q, limit: 3 });
    const actions: SupportAction[] = coaches.map(actionForCoach);
    actions.push({ type: 'marketplace', label: 'Browse all coaches', url: '/newdesign/Marketplace.html' });
    return { reply: `A few coaches who match what you're after: ${coaches.map((c) => c.name).join(', ')}. Tap a name for their profile, or browse the whole marketplace.`, actions };
  }
  return { reply: "Thanks for reaching out — I've passed this to the Shape team and they'll follow up right here. In the meantime, is there anything else I can help with?", actions: [] };
}

export async function POST(request: Request) {
  const parsed = await readJson<{ messages?: ChatMessage[] }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && m.content) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return NextResponse.json({ error: 'No message provided.' }, { status: 400 });

  const propose = await makePropose(request);
  const ai = await askOpenAI(messages, propose).catch(() => null);
  if (ai) return NextResponse.json({ reply: ai.reply, source: 'ai', actions: ai.actions });

  const fb = fallbackReply(String(lastUser.content || ''));
  return NextResponse.json({ reply: fb.reply, source: 'fallback', actions: fb.actions });
}
