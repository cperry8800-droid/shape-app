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
//
// READ tools (2026-09-21): a verified member's Nora can LOOK THINGS UP —
// today's and this week's plan, recent workouts, the week in numbers, habits,
// coaching sessions, reminders, points — through src/lib/ai/memberReads.mjs,
// every read on the caller's own RLS client. A coach additionally gets
// find_client (a name → the id every coach action needs) and
// get_client_snapshot (the gated definer RPCs the coach surfaces already use).
// A read that fails says so; it never comes back as "you have nothing".
//
// MODEL TIERING: this route has no membership gate (Cook Mode and the website
// widget answer signed-out visitors), and GPT-6 Astra bills five times the
// economy model. So a verified member gets the pinned model (aiModel) and an
// anonymous caller gets aiPublicModel() — the economy model by default.
//
// VOICE (2026-09-21): the body may carry { voice: true } — the message was
// spoken and the reply will be read aloud — which adds the spoken-reply rules
// to the prompt; { locale } — the app's language, which the prompt names so a
// short spoken question in German is answered in German; and { surface: 'app' }
// — the mobile app, where a coach chip opens the Listing by provider id and the
// example directory is not on the marketplace at all. None of the three is
// read for access. Three more things Nora can look up: get_account (the
// member's own profile, plan, coach subscriptions and preferences), shape_help
// (a sourced knowledge base for how Shape works — every caller, nothing in it
// is private), and recommend_coaches over the LIVE trainers / nutritionists
// rows (public-read tables), merged with the example directory on the website
// only, the way the website's marketplace lists them.

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { callAI, hasOpenAIKey, aiPublicModel } from '@/lib/ai';
import {
  rankCoaches, coachSlug, coachProfileUrl, mergeCoachPools, liveCoachFromRow, COACH_CATALOG, LIVE_COACH_COLUMNS, LIVE_COACH_CAP, livePriceColumn,
  type Coach, type CoachRole, type LiveCoachRow,
} from '@/lib/coach-catalog';
import { clientForRequest } from '@/lib/request-auth';
import { searchKnowledge } from '@/lib/ai/shapeKnowledge.mjs';
import { languageNameFor, normalizeLocale } from '@/lib/ai/voiceLang.mjs';
import { proposeChange } from '@/lib/ai/proposals.mjs';
import { resolveActor, makeCtx, serverRegistry, proposalSecret, casWriteUserGoals, auditSink, type Actor } from '@/lib/ai/server';
import { toneInstruction } from '@/lib/ai/tone.mjs';
import { formatMemberContext, UNAVAILABLE_NOTE } from '@/lib/ai/memberContext.mjs';
import { formatCookContext, COOK_CONTEXT_HEADER } from '@/lib/ai/cookContext.mjs';
import { rememberMemoryTool, forgetMemoryTool } from '@/lib/ai/actions.mjs';
import { computeMembership } from '@/lib/membership-core';
import { searchFoodsServer } from '@/lib/food-search-server';
import { plainText } from '@/lib/ai/replyText.mjs';
import {
  readTrainingPlan, readRecentTraining, readWeekSummary, readHabits, readCoaching, readReminders, readPoints,
  readCoachRoster, findClient, readClientSnapshot, readAccount,
} from '@/lib/ai/memberReads.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Structured, tappable follow-ups the client renders under Nora's reply.
//   - 'coach'       → a specific coach detail page (web url) / marketplace (mobile);
//                     a LIVE listing also carries providerId (what the app opens a
//                     Listing by), an EXAMPLE listing is marked example
//   - 'marketplace' → open the marketplace, optionally filtered to a role
//   - 'screen'      → an in-app destination (settings/integrations/billing/pricing)
type SupportAction =
  | { type: 'coach'; label: string; role: CoachRole; slug: string; url: string; meta?: string; providerId?: number; example?: boolean }
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
  'Be warm, concise (1-4 sentences; up to 8 short ones only when they ask for detail), specific, and action-oriented — actually help, do not just describe where to look.',
  'FORMAT: plain conversational prose only. No markdown — no headings, no bullet or numbered lists, no bold or asterisks, no tables, no code, no emoji. Your reply is shown in a plain chat bubble exactly as written.',
  '',
  "LOOKUPS: For a signed-in member you can LOOK THINGS UP with the read tools before you answer: get_training_plan (what is on today and this week, plus today's meals off their menu), get_recent_workouts (the last sessions and the top sets in each), get_week_summary (the last 7 days in numbers: nutrition, training, sleep and recovery, weigh-in trend, habit completion), get_habits (their habits with today's state and streaks), get_coaching (their coaches and booked sessions), get_reminders, get_points (recent Shape Score entries), get_account (their own profile, membership and billing status, coach subscriptions, units, language, timezone, notification and privacy preferences, Nora's voice). Use the matching tool BEFORE answering any question about the member's own plan, schedule, progress, numbers, or account — never answer those from memory or by guessing. Quote only what a tool returned, in their own units. If a tool answers unavailable, say you can't see that right now; if it answers empty, say there is nothing there yet. If the tools are not offered, you are talking to someone who is not signed in as a member — say that lookups need a signed-in membership.",
  "COACH LOOKUPS: For a COACH, find_client turns the name they said into the client id every coach action needs — call it first whenever you do not already have the id, and NEVER invent an id. If it returns several candidates, ask which one; if none, say who is on their roster. get_client_snapshot gives that client's recent training, nutrition, weight and lifts (only for a client they actively coach).",
  '',
  'COACHES: When a member wants to find, switch, compare, or get matched with a coach (trainer or nutritionist), CALL the recommend_coaches tool and then recommend specific people by name with one short reason each (specialty, city, or rating). Ask at most ONE clarifying question (e.g. goal, in-person vs remote) only if you truly cannot pick a sensible focus; otherwise just recommend. Never invent coaches — only mention ones the tool returns. The tool lists the live marketplace first; a result marked example is a demonstration listing rather than a real coach — prefer the real ones, and if you mention an example say it is an example listing. Quote a price, rating or credential only when the listing states one; a coach marked atCapacity is not taking new clients right now.',
  '',
  "HOW SHAPE WORKS: For a question about Shape itself — what it costs and includes, whether a coach is required, coach prices and what coaches pay, cancelling or billing, Shape Radio, coach credentials and the Verified badge, switching coaches, the Shape Score and its tiers and rewards, habits, units, Cook Mode and recipes, privacy and data, the account, or what you can do — call shape_help and answer from what it returns (each entry names its source). If it returns no entry, say you don't have that written down and offer to pass the question to the Shape team. Never invent a policy, a price or a date.",
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
    name: 'shape_help',
    description:
      "How Shape works — a small, sourced knowledge base: what a membership costs and includes, whether a coach is required, coach prices and what coaches pay, cancelling and billing, Shape Radio, coach credentials and the Verified badge, switching coaches, the Shape Score and its tiers, habits, units, Cook Mode and recipes, what Nora can do, privacy and data, account and eligibility. Call it for any question about Shape itself (not about this member's own data) and answer from the entries it returns.",
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: "The question in the member's own words." } },
      required: ['question'],
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
// ── Member-only READ tools ────────────────────────────────────────────────────
// No parameters: each answers for the SIGNED-IN member on the caller's own RLS
// client, so there is nothing a member could pass to read someone else. Strict
// schemas with an empty property set, so the model cannot smuggle an argument.
const NO_ARGS = { type: 'object', properties: {}, required: [] as string[], additionalProperties: false };
const MEMBER_READ_TOOLS = [
  { type: 'function', name: 'get_training_plan', description: "The member's training plan for this week — which sessions are on today (dated or a weekly repeat), everything scheduled this week with exercises, how many later weeks exist — and today's meals off their active menu with the day's targets. Call before answering 'what's on today', 'what do I eat', or anything about their plan.", parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_recent_workouts', description: 'The last few sessions the member completed, with the top sets per move exactly as logged (units as stated in the log). Call for questions about what they lifted or trained recently.', parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_week_summary', description: 'The last 7 days in numbers: days logged and average intake, days trained and workout minutes, sleep and recovery averages where a wearable reports them, the latest weigh-in and the change from the one before, habit completion. Call for "how was my week", "am I on track", trend questions.', parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_habits', description: "The member's habits with today's done state, the last-7-days count and the current streak. Call before check_habit when you need the exact habit name, and for any habit question.", parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_coaching', description: "The member's coaches (their team), their next booked coaching sessions with coach names, and the last sessions held. Call for 'when is my next session', 'who is my coach'.", parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_reminders', description: "The member's scheduled reminders (kind, time, days, timezone, on/off). Call before set_reminder to avoid duplicates and for any reminder question.", parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_points', description: 'The most recent Shape Score ledger entries and the points earned in the last 7 days. Call for "how did I earn points", "what did I get for that".', parameters: NO_ARGS, strict: true },
  { type: 'function', name: 'get_account', description: "The member's OWN account: name, email, username, location, member-since date, profile visibility and roles; the platform plan (on record or not, status, price, period end); coach subscriptions with coach, status, price and period end; Settings preferences (units, week start, timezone, language, check-in, online visibility, workout-data sharing, notification settings), Nora's voice, the app language and the timezone. Call for 'what plan am I on', 'when do I renew', 'what email is on my account', 'what units am I in', 'who am I subscribed to'.", parameters: NO_ARGS, strict: true },
];
// ── Coach-only READ tools (a verified coach: trainer / nutritionist) ─────────
const COACH_TOOLS = [
  { type: 'function', name: 'find_client', description: "Resolve a client the coach named to the client's id from the COACH'S OWN active roster. Exactly one match returns the client; several return candidates to ask about; none returns the roster names. Call this before any client action when you do not already have the id.", parameters: { type: 'object', properties: { name: { type: 'string', description: 'The name as the coach said it.' } }, required: ['name'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'get_client_snapshot', description: "A coached client's recent numbers: sessions kept, workout minutes, days logged and average macros, latest and starting weight, key lifts. Only for a client this coach actively coaches; otherwise it answers allowed:false.", parameters: { type: 'object', properties: { clientId: { type: 'string', description: 'The client id from find_client or context.' } }, required: ['clientId'], additionalProperties: false }, strict: true },
];
const READ_TOOLS = new Set([...MEMBER_READ_TOOLS.map((t) => t.name), ...COACH_TOOLS.map((t) => t.name)]);
// Up to this many model turns per request: a lookup, an action drafted from
// it, and a reply is three; Astra "continues through more steps", so the cap
// is a budget, and the reply is taken on the last round whatever is pending.
const MAX_MODEL_ROUNDS = 5;
const MAX_TOOL_CALLS = 10;
const MAX_OUTPUT_TOKENS = 6000;

const MEMORY_TOOLS = new Set(['remember', 'forget']);
const MEMBER_PROMPT_NOTE =
  "MEMORY: The member can ask you to remember or forget personal preferences — use the remember/forget tools (applied immediately, no confirm; managed under Settings → What Nora remembers). If a forget returns candidates, list them and ask which one.\n" +
  "MEMBER ACTIONS: They can also log a weigh-in (log_weigh_in), log water (log_water), check off a habit (check_habit), and set reminders (set_reminder) — each DRAFTS a confirm card, so say you've drafted it, never that it's done. For a NAMED food, call find_food first and propose log_meal with the REAL returned macros.\n" +
  'THE READ TOOLS ARE AVAILABLE on this turn — use them (see LOOKUPS) before answering anything about this member\'s own plan, schedule, progress or numbers.';
// A spoken turn: the reply is read aloud by text-to-speech, so it is written
// for the ear. Rides only when the client says the message was spoken.
const VOICE_PROMPT_NOTE =
  "VOICE: The member is SPEAKING to you and your reply will be read aloud by text-to-speech, so write for the ear: one to three short sentences, the answer first, no lists, no URLs, no ids, no symbols or abbreviations that do not read aloud (say 'pounds' not 'lb', 'per month' not '/mo', 'four point nine stars' not '★4.9'). If you recommend coaches, name at most two with one short reason each and say they can tap a name below to open the profile — the tappable cards come back with your reply. When you have drafted a change, say so and that the confirm button is below. If you cannot see something, say that in one sentence.";

// The per-request context the READ tools run with: the caller's own RLS client
// and id (member-verified), the clock, and whether the caller is a coach — null
// for anyone else, so a fabricated call fails closed exactly like memory.
type ReadCtx = { sb: Actor['supabase']; uid: string; now: Date; isCoach: boolean };

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
    // Daily calorie/protein TARGETS (coach Adjust override, the plan route's
    // source) so "does this meal fit my day?" can actually be computed — the
    // fact renderer already shows "X of Y target" but nothing populated Y
    // (Codex P2 #1805).
    sb.from('client_programs').select('detail').eq('user_id', uid).maybeSingle(),
    // Habits today — memberContext has rendered "Habits today: X of Y done"
    // since it was written and nothing ever populated it (Nora map, 2026-09-21).
    sb.from('user_habits').select('id').eq('user_id', uid).is('archived_at', null),
    sb.from('user_habit_completions').select('habit_id').eq('user_id', uid).eq('done_on', today),
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
  // Daily targets from the coach nutrition override — validated finite, ≥0, or
  // absent (honest-absent; mirrors the plan route's asTarget).
  const progRow = val<{ detail?: unknown }>(6);
  const nutriDetail =
    progRow && typeof progRow.detail === 'object' && progRow.detail
      ? ((progRow.detail as { nutrition?: unknown }).nutrition as Record<string, unknown> | undefined)
      : undefined;
  const asTarget = (v: unknown): number | null => {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const kcalTarget = asTarget(nutriDetail?.calories);
  const proteinTarget = asTarget(nutriDetail?.protein);
  const todayFacts: Record<string, unknown> = {};
  if (snap) {
    if (snap.calories != null) todayFacts.kcal = Number(snap.calories);
    if (snap.protein_g != null) todayFacts.proteinG = Number(snap.protein_g);
    if (snap.workout_minutes != null && Number(snap.workout_minutes) > 0) todayFacts.trainedToday = true;
  }
  if (kcalTarget != null) todayFacts.kcalTarget = kcalTarget;
  if (proteinTarget != null) todayFacts.proteinTarget = proteinTarget;
  const habitRows = val<Array<{ id?: string }>>(7);
  const doneRows = val<Array<{ habit_id?: string }>>(8);
  if (Array.isArray(habitRows) && habitRows.length && Array.isArray(doneRows)) {
    const ids = new Set(habitRows.map((h) => String(h.id)));
    todayFacts.habitsTotal = ids.size;
    todayFacts.habitsDone = new Set(doneRows.map((d) => String(d.habit_id)).filter((id) => ids.has(id))).size;
  }
  if (Object.keys(todayFacts).length) facts.today = todayFacts;
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

// One line per coach for the model, built from what the listing STATES: a live
// row with no rating, rate or credential simply has none of them in its line
// (the example directory carries all of them), and nothing is defaulted in.
function coachLine(c: Coach): string {
  const where = [c.role, c.city].filter(Boolean).join(', ');
  const creds = [c.cert, c.years != null ? `${c.years}y` : '', c.format].filter(Boolean).join(', ');
  const terms = [c.rate != null ? `$${c.rate}/session` : '', c.rating != null ? `★${c.rating}` : ''].filter(Boolean).join(', ');
  const flags = [c.verified ? 'Verified' : '', c.atCapacity ? 'at capacity' : '', c.example ? 'example listing' : ''].filter(Boolean).join(', ');
  return [`${c.name} — ${where}`, c.specialties.join(', '), creds, terms, flags].filter(Boolean).join('. ') + '.';
}

function actionForCoach(c: Coach): SupportAction {
  const meta = [c.role, c.rating != null ? `★${c.rating}` : '', c.example ? 'example listing' : ''].filter(Boolean).join(' · ');
  return {
    type: 'coach',
    label: `${c.name} →`,
    role: c.tag === 'Nutritionist' ? 'nutritionist' : 'trainer',
    slug: coachSlug(c.name),
    url: coachProfileUrl(c),
    ...(meta ? { meta } : {}),
    // The app opens a live Listing by provider id (shape:openMarket's coachId);
    // an example listing is marked so a client can say what it is showing.
    ...(c.providerId != null ? { providerId: c.providerId } : {}),
    ...(c.example ? { example: true } : {}),
  };
}

// The per-request context the coach lookup runs with: a Supabase client that
// can read the public marketplace tables (the caller's own, or the request's
// anonymous client for a signed-out visitor) and which surface is asking.
type CoachCtx = { sb: Actor['supabase'] | null; surface: 'app' | 'web' };

// The live marketplace — the trainers / nutritionists rows both surfaces list.
// Newest listings first under the cap (a recently joined real coach beats a
// stale seeded row if the cap ever bites); rankCoaches orders the pool. A
// table that could not be read is null, and ok:false only when none could.
async function liveCoaches(sb: NonNullable<CoachCtx['sb']>, role: CoachRole | 'any'): Promise<{ ok: boolean; coaches: Coach[] }> {
  const wanted: CoachRole[] = role === 'any' ? ['trainer', 'nutritionist'] : [role];
  const legs = await Promise.all(wanted.map(async (r) => {
    try {
      const table = r === 'nutritionist' ? 'nutritionists' : 'trainers';
      const res = await sb.from(table).select(`${LIVE_COACH_COLUMNS}, ${livePriceColumn(r)}`).order('id', { ascending: false }).limit(LIVE_COACH_CAP);
      if (res.error || !Array.isArray(res.data)) return null;
      return (res.data as LiveCoachRow[]).map((row) => liveCoachFromRow(row, r)).filter((c): c is Coach => !!c);
    } catch {
      return null;
    }
  }));
  if (legs.every((l) => l === null)) return { ok: false, coaches: [] };
  return { ok: true, coaches: legs.flatMap((l) => l ?? []) };
}

type ToolOut = { result: unknown; actions: SupportAction[] };
type ProposeFn = (name: string, args: Record<string, unknown>) => Promise<ToolOut>;

// Runs a tool call; returns { result (for the model), actions (for the UI) }.
// Read tools (recommend_coaches) run here; WRITE tools route through `propose`,
// which drafts a confirm-required change via the AI1 scaffold (never executes).
// MEMORY tools (members only — the schemas are never exposed otherwise) run
// DIRECTLY with audit; memoryCtx is null for non-members, so even a fabricated
// call fails closed.
async function runTool(name: string, args: Record<string, unknown>, propose: ProposeFn, memoryCtx: MemoryCtx | null, reads: ReadCtx | null = null, coach: CoachCtx = { sb: null, surface: 'web' }): Promise<ToolOut> {
  if (READ_TOOLS.has(name)) {
    // Member-only READS. The schemas exist only in a member's tool list, and a
    // call with no context fails closed rather than reading anything.
    if (!reads) return { result: { error: 'members_only' }, actions: [] };
    const result = await runRead(name, args, reads);
    return { result, actions: [] };
  }
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
  if (name === 'shape_help') {
    // Every caller, signed in or not: nothing in the knowledge base is private,
    // and a visitor asking what Shape costs is the case it exists for.
    const question = String(args.question || '').trim().slice(0, 240);
    return { result: searchKnowledge(question, { limit: 3 }), actions: [] };
  }
  if (name === 'recommend_coaches') {
    const role = (['trainer', 'nutritionist', 'any'].includes(String(args.role)) ? String(args.role) : 'any') as CoachRole | 'any';
    const focus = typeof args.focus === 'string' ? args.focus : '';
    const limit = typeof args.limit === 'number' ? args.limit : 3;
    // The live marketplace first. On the APP the example directory is not on
    // the marketplace at all, so a failed live read is "unavailable" rather
    // than a list of people the app cannot open; the website lists the
    // examples after the real coaches, as its own marketplace does.
    const live = coach.sb ? await liveCoaches(coach.sb, role) : { ok: false, coaches: [] as Coach[] };
    if (!live.ok && coach.surface === 'app') return { result: { ok: false, error: 'unavailable', message: 'The marketplace could not be read right now.' }, actions: [] };
    const pool = mergeCoachPools(live.coaches, coach.surface === 'app' ? [] : COACH_CATALOG);
    const coaches = rankCoaches({ role, focus, limit, pool });
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
        ...(live.ok ? {} : { liveUnavailable: true }),
        coaches: coaches.map((c) => ({
          name: c.name,
          role: c.role,
          kind: c.tag,
          listing: c.example ? 'example' : 'live',
          ...(c.city ? { city: c.city } : {}),
          specialties: c.specialties,
          ...(c.cert ? { cert: c.cert } : {}),
          ...(c.years != null ? { years: c.years } : {}),
          ...(c.format ? { format: c.format } : {}),
          ...(c.rate != null ? { rate: c.rate } : {}),
          ...(c.rating != null ? { rating: c.rating } : {}),
          ...(c.verified ? { verified: true } : {}),
          ...(c.atCapacity ? { atCapacity: true } : {}),
          summary: coachLine(c),
        })),
      },
      actions,
    };
  }
  return { result: { error: `Unknown tool ${name}` }, actions: [] };
}

// A read that could not be performed says so in a shape the prompt teaches the
// model to relay ("I can't see that right now") — distinct from an empty
// result, which is "nothing there yet". Never a thrown error into the loop.
async function runRead(name: string, args: Record<string, unknown>, reads: ReadCtx): Promise<unknown> {
  const { sb, uid, now } = reads;
  try {
    switch (name) {
      case 'get_training_plan': return await readTrainingPlan(sb, uid, { now });
      case 'get_recent_workouts': return await readRecentTraining(sb, uid, { now });
      case 'get_week_summary': return await readWeekSummary(sb, uid, { now });
      case 'get_habits': return await readHabits(sb, uid, { now });
      case 'get_coaching': return await readCoaching(sb, uid, { now });
      case 'get_reminders': return await readReminders(sb, uid);
      case 'get_points': return await readPoints(sb, uid, { now });
      case 'get_account': return await readAccount(sb, uid);
      case 'find_client': {
        if (!reads.isCoach) return { error: 'not_a_coach', message: 'Only a coach can look up a client.' };
        const roster = (await readCoachRoster(sb, uid)) as { ok: boolean; isCoach?: boolean; clients?: Array<{ id: string; name: string | null; roles: string[] }> };
        if (!roster.ok) return { ok: false, error: 'unavailable', message: 'The roster could not be read right now.' };
        if (!roster.isCoach) return { error: 'not_a_coach', message: 'No coach profile is linked to this account.' };
        const q = String(args.name || '').trim().slice(0, 80);
        return { ok: true, ...findClient(roster.clients, q) };
      }
      case 'get_client_snapshot': {
        if (!reads.isCoach) return { error: 'not_a_coach', message: 'Only a coach can read a client snapshot.' };
        const id = String(args.clientId || '').trim();
        if (!/^[0-9a-f-]{20,64}$/i.test(id)) return { error: 'bad_client_id', message: 'Pass the client id from find_client.' };
        return await readClientSnapshot(sb, id);
      }
      default: return { error: `Unknown tool ${name}` };
    }
  } catch {
    return { ok: false, error: 'unavailable' };
  }
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
  member: { contextMsg: string | null; memberTools: typeof MEMBER_TOOLS; memoryCtx: MemoryCtx | null; cookMsg: string | null; reads: ReadCtx | null; coachTools: typeof COACH_TOOLS; isMember: boolean; voice: boolean; locale: string | null; coach: CoachCtx },
  signal?: AbortSignal,
): Promise<{ reply: string; actions: SupportAction[]; model: string | null } | null> {
  if (!hasOpenAIKey()) return null;
  const recent = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  // The tone shapes the framing (supportive vs direct) but never the facts.
  // The memory note rides ONLY for verified members (their tool list carries
  // remember/forget) — the base prompt stays byte-identical for everyone else.
  // COOK MODE (CodeRabbit PR #1805, outside-diff): tools=[] makes every
  // advertised action impossible, so the member note is SUPPRESSED and an
  // explicit no-tools override rides instead — without it the base prompt's
  // "you can DO things" framing invites a false "done" claim mid-cook.
  const cookOverride = member.cookMsg
    ? "\n\nCOOK MODE: No tools are available on this turn — you are answering a cooking question only. Never say you logged, saved, drafted, assigned, remembered, or changed anything; if asked to, say you can't do that mid-cook and that it's one tap in the app once they're done cooking."
    : '';
  // A spoken turn gets the for-the-ear rules; a non-English app language is
  // named so a short spoken question is answered in the member's language.
  const langName = member.locale && member.locale !== 'en' ? languageNameFor(member.locale) : null;
  const langNote = langName ? `\n\nLANGUAGE: The member's app is set to ${langName} (${member.locale}). Answer in ${langName} unless they write to you in another language; keep coach names, product names and figures as they are.` : '';
  const systemPrompt = `${SYSTEM_PROMPT}${member.memberTools.length && !member.cookMsg ? `\n\n${MEMBER_PROMPT_NOTE}` : ''}${cookOverride}${member.voice ? `\n\n${VOICE_PROMPT_NOTE}` : ''}${langNote}\n\n${toneInstruction(tone)}`;
  let input: unknown[] = [
    { role: 'system', content: systemPrompt },
    // The server-built member-context block (or the honest unavailable note on
    // a fetch FAILURE) — never client-supplied, members only.
    ...(member.contextMsg ? [{ role: 'system', content: member.contextMsg }] : []),
    // Cook-mode sous-chef context (spec §7.3) — TWO messages: the fixed header
    // (our text) rides system, while the recipe payload — CLIENT-supplied,
    // sanitized + bounded — rides as a plain USER-role data message, so
    // client-controlled text never sits in the system trust tier (CWE-1427,
    // CodeRabbit PR #1805). Sits AFTER member facts so "does this fit my
    // day?" can use both. Read-only: when cooking, NO write/coach/member tools.
    ...(member.cookMsg
      ? [
          { role: 'system', content: COOK_CONTEXT_HEADER },
          { role: 'user', content: member.cookMsg },
        ]
      : []),
    ...recent,
  ];
  const actions: SupportAction[] = [];
  // Cook Mode: no tools at all. A member: the base tools, the member action +
  // memory tools, the READ tools, and — for a coach — the two coach lookups.
  const tools = member.cookMsg
    ? []
    : (member.memberTools.length ? [...TOOLS, ...member.memberTools, ...MEMBER_READ_TOOLS, ...member.coachTools] : TOOLS);
  // ⚠ MODEL TIERING: a signed-in-and-verified member rides the pin (Astra);
  // anyone else rides the public model. `model` is set explicitly for the
  // public path only — an explicit model also disables callAI's access
  // fallback, which is right: the economy model needs no fallback.
  // ⚠ AND A REFUSED PIN IS REFUSED FOR THE WHOLE REQUEST: once a round has
  // fallen back, the later rounds name the fallback model directly instead of
  // paying a refused Astra call each — and every reasoning item echoed back
  // through the transcript then comes from the one model that is answering.
  let pinnedModel: string | null = member.isMember ? null : aiPublicModel();

  // Up to MAX_MODEL_ROUNDS model turns, MAX_TOOL_CALLS tool calls, then take
  // the text. When cooking, tools is empty (read-only kitchen) — omit it so the
  // model runs pure-conversational. Built per round because `input` is
  // reassigned as tool outputs accumulate.
  let toolCalls = 0;
  let answeredBy: string | null = null;
  for (let round = 0; round < MAX_MODEL_ROUNDS; round++) {
    // Thread the request's abort signal so a client disconnect (e.g. the member
    // closes Cook Mode mid-reply) cancels the in-flight OpenAI request instead
    // of letting the recipe/member context keep traveling + accruing cost
    // (Codex P2 #1805; callAI already wires opts.signal into its fetch).
    const body: Record<string, unknown> = { input, max_output_tokens: MAX_OUTPUT_TOKENS, ...(pinnedModel ? { model: pinnedModel } : {}) };
    if (tools.length) body.tools = tools;
    // `low` effort + `low` verbosity: a chat bubble wants the answer in a
    // second and in a sentence; the lookups, not the reasoning budget, are
    // what make it right.
    const result = await callAI(body, { promptId: 'support.chat', signal, effort: 'low', verbosity: 'low' });
    if (!result.ok) return null;
    answeredBy = result.model;
    if (result.fellBack) pinnedModel = result.model;
    const payload = result.data as OpenAIResponsePayload;
    const output = Array.isArray(payload.output) ? payload.output : [];
    const calls = output.filter((o) => o.type === 'function_call');
    const budgetLeft = toolCalls < MAX_TOOL_CALLS;
    if (calls.length === 0 || round === MAX_MODEL_ROUNDS - 1 || !budgetLeft) {
      const reply = plainText(extractOutputText(payload));
      return reply ? { reply, actions, model: answeredBy } : null;
    }
    // Echo the model's output items back (function calls AND the reasoning
    // items that precede them — a reasoning model refuses a call without its
    // reasoning), then append our outputs.
    input = input.concat(output as unknown[]);
    for (const call of calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.arguments || '{}');
      } catch {
        parsed = {};
      }
      toolCalls += 1;
      const { result, actions: a } = toolCalls <= MAX_TOOL_CALLS
        ? await runTool(String(call.name), parsed, propose, member.memoryCtx, member.reads, member.coach)
        : { result: { error: 'tool_budget_exhausted', message: 'Answer with what you have.' }, actions: [] as SupportAction[] };
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
  // How Shape works, from the same sourced knowledge base the model reads — a
  // static answer that stays honest with the key unset; a tag or a title hit
  // is required (minScore 4), never a stray body word.
  const known = searchKnowledge(text, { limit: 1, minScore: 4 });
  if (known.entries.length) return { reply: known.entries[0].body, actions: [] };
  return { reply: "Thanks for reaching out — I've passed this to the Shape team and they'll follow up right here. In the meantime, is there anything else I can help with?", actions: [] };
}

export async function POST(request: Request) {
  const parsed = await readJson<{ messages?: ChatMessage[]; tone?: string; cookContext?: unknown; voice?: unknown; surface?: unknown; locale?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && m.content) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return NextResponse.json({ error: 'No message provided.' }, { status: 400 });

  // Cook-mode sous-chef context (spec §7.3): sanitized + bounded from the
  // client's untrusted payload. Present ⇒ read-only kitchen (no write tools).
  // Available to signed-out cooks too (recipe grounding needs no membership);
  // member facts, when present, still ride alongside for "does this fit my day?".
  const cookMsg = formatCookContext(body.cookContext);

  // Voice, surface and language are the client's claims about HOW the member
  // is talking, never about WHO they are: they shape the prompt and the chips,
  // and nothing reads them for access. Each is reduced to a known value.
  const voice = body.voice === true;
  const surface: CoachCtx['surface'] = body.surface === 'app' ? 'app' : 'web';
  const locale = normalizeLocale(body.locale);

  // Resolve the actor ONCE; membership (fail-closed) decides whether the
  // member-only layer exists AT ALL for this request: the context block, the
  // memory tool schemas, and the direct-tool executor. A signed-out or
  // signed-in-NON-member request runs the exact pre-PR-B path — same prompt,
  // same TOOLS array, no context — byte-identical behavior.
  const actor = await resolveActor(request).catch(() => null);
  let contextMsg: string | null = null;
  let memberTools: typeof MEMBER_TOOLS = [];
  let memoryCtx: MemoryCtx | null = null;
  let reads: ReadCtx | null = null;
  let coachTools: typeof COACH_TOOLS = [];
  let isMember = false;
  if (actor) {
    const membership = await computeMembership(actor.supabase, actor.user.id, actor.user.email ?? null).catch(() => null);
    if (membership && membership.isMember) {
      isMember = true;
      memberTools = MEMBER_TOOLS;
      // Coach access is MEMBERSHIP's verdict, not the profile's primary role:
      // computeMembership reads `roles[]` as well as `role`, so a dual-role
      // account whose primary role is 'client' still gets the coach lookups,
      // and an admin is included explicitly (CodeRabbit, #2128).
      const isCoach = !!(membership.isCoach || membership.isAdmin);
      reads = { sb: actor.supabase, uid: actor.user.id, now: new Date(), isCoach };
      if (isCoach) coachTools = COACH_TOOLS;
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
  // The coach lookup reads the PUBLIC marketplace tables: the member's own
  // client when there is one, else the request's anonymous client (a signed-out
  // visitor asking for a coach is the website widget's oldest use). A client
  // that cannot be built leaves the lookup on the example directory (web) or
  // honestly unavailable (app).
  const coachSb = actor ? actor.supabase : await clientForRequest(request).catch(() => null);
  const coach: CoachCtx = { sb: coachSb, surface };

  const ai = await askOpenAI(messages, propose, body.tone, { contextMsg, memberTools, memoryCtx, cookMsg, reads, coachTools, isMember, voice, locale, coach }, request.signal).catch(() => null);
  if (ai) return NextResponse.json({ reply: ai.reply, source: 'ai', actions: ai.actions, model: ai.model });

  // Cook Mode is a read-only, grounded sous-chef: the support fallback can claim
  // "I've passed this to the Shape team" or return coach/screen actions, which
  // violates that contract when the model is unavailable. Return NO reply + NO
  // actions — the cook client renders its own localized "I couldn't answer that
  // just now" (cook:voice.unavailable, ×13) on an empty reply, so this stays
  // honest AND localized rather than a hardcoded English string (CodeRabbit
  // Major + adversarial review PR #1805).
  if (cookMsg) {
    return NextResponse.json({ reply: '', source: 'cook_unavailable', actions: [] });
  }

  const fb = fallbackReply(String(lastUser.content || ''));
  return NextResponse.json({ reply: fb.reply, source: 'fallback', actions: fb.actions });
}
