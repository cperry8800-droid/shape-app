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
  | { type: 'screen'; label: string; screen: string; url?: string };

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
];

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

// Runs a tool call; returns { result (for the model), actions (for the UI) }.
function runTool(name: string, args: Record<string, unknown>): { result: unknown; actions: SupportAction[] } {
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

async function askOpenAI(
  messages: ChatMessage[]
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
      const { result, actions: a } = runTool(String(call.name), parsed);
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

  const ai = await askOpenAI(messages).catch(() => null);
  if (ai) return NextResponse.json({ reply: ai.reply, source: 'ai', actions: ai.actions });

  const fb = fallbackReply(String(lastUser.content || ''));
  return NextResponse.json({ reply: fb.reply, source: 'fallback', actions: fb.actions });
}
