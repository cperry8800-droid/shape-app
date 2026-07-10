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
import { resolveActor, makeCtx, serverRegistry, proposalSecret, casWriteUserGoals, auditSink, type Actor } from '@/lib/ai/server';
import { toneInstruction } from '@/lib/ai/tone.mjs';
import { formatMemberContext, UNAVAILABLE_NOTE } from '@/lib/ai/memberContext.mjs';
import { rememberMemoryTool, forgetMemoryTool } from '@/lib/ai/actions.mjs';
import { computeMembership } from '@/lib/membership-core';
import { searchFoodsServer } from '@/lib/food-search-server';

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
const WRITE_TOOLS = new Set(['log_meal', 'set_client_goal', 'assign_workout', 'assign_meal_plan', 'set_program_detail', 'add_review_note', 'reschedule_session', 'log_weigh_in', 'log_water', 'check_habit', 'set_reminder']);

// ── Member-only tools (memory) ────────────────────────────────────────────────
// Appended to the tool list ONLY for a verified member (computeMembership,
// fail-closed) — a signed-out or signed-in-prospect request carries exactly the
// TOOLS array above, byte-identical to today, so non-members can never even
// discover these. Direct-with-audit: applied inline (no confirm card, #1652).
const MEMBER_TOOLS = [
  {
    type: 'function',
    name: 'remember',
    description:
      "Remember a short personal fact the member EXPLICITLY asked you to keep (e.g. 'remember I hate burpees'). Pass their words, not your rewrite. Applied immediately (no confirm); tell them it's saved and manageable under Settings → What Nora remembers.",
    parameters: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The fact, in their words. Keep it short.' } },
      required: ['note'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'forget',
    description:
      'Delete ONE remembered note when the member asks you to forget it. Prefer note_id (ids are listed with your member facts); pass note (the exact text) only when you have no id. Never pass both. If the result lists candidates, relay them and ask which one.',
    parameters: {
      type: 'object',
      properties: { note_id: { type: 'string' }, note: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  // ── PR C · member action tools (spec #1652 §3) — the four writes DRAFT a
  // confirm card (never applied until the member approves); find_food is a
  // read-only lookup feeding a real-macro log_meal proposal.
  {
    type: 'function',
    name: 'log_weigh_in',
    description:
      "Log the member's OWN weigh-in for today. Use when they tell you their weight. Pass exactly what they said — never convert or guess a unit. DRAFTS the change for them to confirm.",
    parameters: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'The weight value they gave.' },
        unit: { type: 'string', enum: ['lb', 'kg'], description: 'Only if they said it.' },
      },
      required: ['weight'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'log_water',
    description:
      "Add water to the member's OWN hydration for today. Pass the amount and unit they gave (ml or oz). DRAFTS the change for them to confirm.",
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The amount they said.' },
        unit: { type: 'string', enum: ['ml', 'oz'], description: 'The unit they said.' },
      },
      required: ['amount', 'unit'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'check_habit',
    description:
      "Check off one of the member's OWN habits for today. Pass the habit as they said it — the server matches it against their real habit list and FAILS CLOSED on no match or several matches (relay the candidates and ask which). DRAFTS the change for them to confirm.",
    parameters: {
      type: 'object',
      properties: { habit: { type: 'string', description: 'The habit, in their words.' } },
      required: ['habit'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'set_reminder',
    description:
      "Set a recurring reminder for the member (weigh_in, checkin, water, photo, or custom with a label). time is HH:MM 24h; days is 0=Sun…6=Sat (defaults to weekdays — say so). DRAFTS the reminder for them to confirm.",
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['weigh_in', 'checkin', 'water', 'photo', 'custom'] },
        time: { type: 'string', description: 'HH:MM, 24-hour.' },
        days: { type: 'array', items: { type: 'integer' }, description: '0=Sun…6=Sat. Omit for weekdays.' },
        label: { type: 'string', description: 'Required for kind=custom — what to remind them of.' },
      },
      required: ['kind', 'time'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'find_food',
    description:
      "Look up REAL foods + macros (USDA + Open Food Facts) BEFORE proposing log_meal for a named food — e.g. 'log a chipotle chicken bowl' → find_food first, then log_meal with the returned numbers. NEVER invent macros; if the lookup is unavailable, say so and ask for their numbers.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The food to search, e.g. "chicken burrito bowl".' } },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
];
const MEMORY_TOOLS = new Set(['remember', 'forget']);
const MEMBER_PROMPT_NOTE =
  "MEMORY: The member can ask you to remember or forget personal preferences — use the remember/forget tools (applied immediately, no confirm; managed under Settings → What Nora remembers). If a forget returns candidates, list them and ask which one.\n" +
  "MEMBER ACTIONS: They can also log a weigh-in (log_weigh_in), log water (log_water), check off a habit (check_habit), and set reminders (set_reminder) — each DRAFTS a confirm card, so say you've drafted it, never that it's done. For a NAMED food, call find_food first and propose log_meal with the REAL returned macros.";

// The per-request context a direct memory tool runs with (member-verified).
type MemoryCtx = {
  actor: { id: string; role: string };
  supabase: Actor['supabase'];
  audit: ReturnType<typeof auditSink>;
  isMember: true;
  casWrite: (kind: string, mutate: (doc: unknown) => Record<string, unknown>) => Promise<{ ok: boolean; error?: string; candidates?: unknown }>;
};

// Thin, fail-soft member-fact fetchers — caller-RLS ONLY (actor.supabase), every
// leg independent. `failed` is true only when EVERY leg rejected (a resolved-
// but-empty leg is honest absence, not failure) — that's the UNAVAILABLE_NOTE
// trigger per the spec's honest-unavailable contract.
async function fetchMemberFacts(actor: Actor): Promise<{ facts: Record<string, unknown> | null; failed: boolean }> {
  const sb = actor.supabase;
  const uid = actor.user.id;
  const today = new Date().toISOString().slice(0, 10); // UTC day — mirrors log_meal's snapshot key
  const legs = await Promise.allSettled([
    sb.from('daily_health_snapshot').select('calories, protein_g, workout_minutes').eq('user_id', uid).eq('snapshot_date', today).maybeSingle(),
    sb.rpc('compute_momentum'),
    // 2001 = the completeness probe: exactly 2001 rows back means the ledger
    // was truncated, and a PARTIAL sum would misstate the member's real score
    // — the fact is omitted instead (honest absence beats a wrong number).
    sb.from('score_ledger').select('delta, source_kind').eq('user_id', uid).limit(2001),
    sb.from('client_weigh_ins').select('weight, unit, logged_on').eq('user_id', uid).order('logged_on', { ascending: false }).limit(1).maybeSingle(),
    sb.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'client_goals').maybeSingle(),
    sb.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'nora_memory').maybeSingle(),
  ]);
  const val = <T,>(i: number): T | null => {
    const l = legs[i];
    if (l.status !== 'fulfilled') return null;
    const r = l.value as { data?: unknown; error?: unknown };
    return (r && r.error == null ? (r.data as T) : null) ?? null;
  };
  const okCount = legs.filter((l) => l.status === 'fulfilled' && (l.value as { error?: unknown })?.error == null).length;
  if (okCount === 0) return { facts: null, failed: true };

  const facts: Record<string, unknown> = {};
  const snap = val<{ calories?: number; protein_g?: number; workout_minutes?: number }>(0);
  if (snap) {
    facts.today = {
      kcal: snap.calories != null ? Number(snap.calories) : null,
      proteinG: snap.protein_g != null ? Number(snap.protein_g) : null,
      trainedToday: snap.workout_minutes != null && Number(snap.workout_minutes) > 0 ? true : undefined,
    };
  }
  const mv = val<number>(1);
  if (mv != null) facts.momentum = { value: Number(mv) };
  const ledger = val<Array<{ delta?: number; source_kind?: string }>>(2);
  // An EMPTY ledger is a real score of 0 (a brand-new member) — only a
  // truncated (2001-row) fetch omits the fact.
  if (Array.isArray(ledger) && ledger.length <= 2000) {
    const total = ledger.reduce((a, r) => a + (r.source_kind === 'store_redeem' ? 0 : Number(r.delta) || 0), 0);
    facts.score = { total };
  }
  const weigh = val<{ weight?: number; unit?: string; logged_on?: string }>(3);
  if (weigh && weigh.weight != null) facts.weight = { latest: Number(weigh.weight), unit: weigh.unit || 'lb', loggedOn: weigh.logged_on || null };
  // user_goals rows nest the document under .data — unwrap before reading.
  const goalsRow = val<{ data?: unknown }>(4);
  const goalsDoc = goalsRow && typeof goalsRow === 'object' ? (goalsRow as { data?: unknown }).data : null;
  const overall = goalsDoc && typeof goalsDoc === 'object' ? (goalsDoc as { overall?: { title?: string; target?: number; unit?: string; date?: string } }).overall : null;
  if (overall && overall.title) facts.goal = { title: String(overall.title), target: overall.target, unit: overall.unit, byDate: overall.date };
  const memRow = val<{ data?: unknown }>(5);
  const memDoc = memRow && typeof memRow === 'object' ? ((memRow as { data?: unknown }).data as { notes?: Array<{ id?: string; text?: string }> } | null) : null;
  if (memDoc && Array.isArray(memDoc.notes) && memDoc.notes.length) {
    facts.memory = memDoc.notes.slice(0, 10).filter((n) => n && n.text).map((n) => `${n.text} (id ${n.id})`);
  }
  return { facts: Object.keys(facts).length ? facts : null, failed: false };
}

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
// MEMORY tools (members only — the schemas are never exposed otherwise) run
// DIRECTLY with audit; memoryCtx is null for non-members, so even a fabricated
// call fails closed.
async function runTool(name: string, args: Record<string, unknown>, propose: ProposeFn, memoryCtx: MemoryCtx | null): Promise<ToolOut> {
  if (name === 'find_food') {
    // Member-only READ (the schema only exists in a member's tool list;
    // memoryCtx doubles as the verified-member marker). Real macros for a
    // follow-up log_meal proposal — never a fabricated number.
    if (!memoryCtx) return { result: { error: 'members_only' }, actions: [] };
    const q = String(args.query || '').trim().slice(0, 80);
    if (q.length < 2) return { result: { error: 'query_too_short' }, actions: [] };
    const found = await searchFoodsServer(q).catch(() => ({ results: [], unavailable: true as const }));
    if (found.unavailable) return { result: { error: 'food_search_unavailable', message: 'The food database is unreachable right now — ask the member for their numbers instead.' }, actions: [] };
    type FoodRow = { name?: string; brand?: string; qty?: string; kcal?: number; p?: number; c?: number; f?: number };
    const rows = (found.results as FoodRow[]).slice(0, 5).map((r) => ({
      name: r.name, brand: r.brand || null, serving: r.qty || null,
      kcal: r.kcal ?? null, protein: r.p ?? null, carbs: r.c ?? null, fat: r.f ?? null,
    }));
    return { result: { foods: rows }, actions: [] };
  }
  if (MEMORY_TOOLS.has(name)) {
    if (!memoryCtx) return { result: { error: 'members_only' }, actions: [] };
    const tool = name === 'remember' ? rememberMemoryTool : forgetMemoryTool;
    const result = (await tool.run(memoryCtx, args)) as { done?: boolean; audited?: boolean; error?: string };
    const actions: SupportAction[] = [];
    if (result && result.done) {
      // Honest chip state: never a clean check while the audit is missing.
      const ok = result.audited === true;
      const label = name === 'remember' ? (ok ? 'Noted ✓' : 'Noted — audit pending') : (ok ? 'Forgotten ✓' : 'Forgotten — audit pending');
      actions.push({ type: 'screen', label, screen: 'nora_memory' });
    }
    return { result, actions };
  }
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
// returned token at /api/ai/proposals/confirm. Takes the ALREADY-resolved
// actor + membership (POST resolves both once) — the member self-service
// tools' buildPreview re-checks ctx.isMember as defense-in-depth.
function makePropose(actor: Actor | null, request: Request, isMember: boolean): ProposeFn {
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
      ctx: { ...makeCtx(actor, request), isMember },
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
  tone: string | undefined,
  member: { contextMsg: string | null; memberTools: typeof MEMBER_TOOLS; memoryCtx: MemoryCtx | null },
): Promise<{ reply: string; actions: SupportAction[] } | null> {
  if (!hasOpenAIKey()) return null;
  const recent = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  // The tone shapes the framing (supportive vs direct) but never the facts.
  // The memory note rides ONLY for verified members (their tool list carries
  // remember/forget) — the base prompt stays byte-identical for everyone else.
  const systemPrompt = `${SYSTEM_PROMPT}${member.memberTools.length ? `\n\n${MEMBER_PROMPT_NOTE}` : ''}\n\n${toneInstruction(tone)}`;
  let input: unknown[] = [
    { role: 'system', content: systemPrompt },
    // The server-built member-context block (or the honest unavailable note on
    // a fetch FAILURE) — never client-supplied, members only.
    ...(member.contextMsg ? [{ role: 'system', content: member.contextMsg }] : []),
    ...recent,
  ];
  const actions: SupportAction[] = [];
  const tools = member.memberTools.length ? [...TOOLS, ...member.memberTools] : TOOLS;

  // Allow up to 2 tool rounds, then take the text.
  for (let round = 0; round < 3; round++) {
    const result = await callAI({ input, tools }, { promptId: 'support.chat' });
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
      const { result, actions: a } = await runTool(String(call.name), parsed, propose, member.memoryCtx);
      for (const act of a) actions.push(act);
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  return null;
}

// Rule-based first responder for when the model is unset/down. Still returns
// coach actions for coach questions so the experience degrades gracefully.
// INVARIANT (spec #1652): this takes ONLY the user's text — no member context
// ever reaches it, and its templates are static strings (coach names come from
// the PUBLIC catalog), so a failed-context member can never receive fabricated
// personal metrics through this path. tests/member-context.test.mjs pins the
// context sentinel this function must never emit.
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
  const parsed = await readJson<{ messages?: ChatMessage[]; tone?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && m.content) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return NextResponse.json({ error: 'No message provided.' }, { status: 400 });

  // Resolve the actor ONCE; membership (fail-closed) decides whether the
  // member-only layer exists AT ALL for this request: the context block, the
  // memory tool schemas, and the direct-tool executor. A signed-out or
  // signed-in-NON-member request runs the exact pre-PR-B path — same prompt,
  // same TOOLS array, no context — byte-identical behavior.
  const actor = await resolveActor(request).catch(() => null);
  let contextMsg: string | null = null;
  let memberTools: typeof MEMBER_TOOLS = [];
  let memoryCtx: MemoryCtx | null = null;
  let isMember = false;
  if (actor) {
    const membership = await computeMembership(actor.supabase, actor.user.id, actor.user.email ?? null).catch(() => null);
    if (membership && membership.isMember) {
      isMember = true;
      memberTools = MEMBER_TOOLS;
      memoryCtx = {
        actor: { id: actor.user.id, role: actor.role },
        supabase: actor.supabase,
        audit: auditSink(actor.supabase),
        isMember: true,
        casWrite: (kind, mutate) => casWriteUserGoals(actor.supabase, actor.user.id, kind, mutate),
      };
      const { facts, failed } = await fetchMemberFacts(actor).catch(() => ({ facts: null, failed: true }));
      contextMsg = failed ? UNAVAILABLE_NOTE : formatMemberContext(facts);
    }
  }
  const propose = makePropose(actor, request, isMember);

  const ai = await askOpenAI(messages, propose, body.tone, { contextMsg, memberTools, memoryCtx }).catch(() => null);
  if (ai) return NextResponse.json({ reply: ai.reply, source: 'ai', actions: ai.actions });

  const fb = fallbackReply(String(lastUser.content || ''));
  return NextResponse.json({ reply: fb.reply, source: 'fallback', actions: fb.actions });
}
