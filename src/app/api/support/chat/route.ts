// Shape in-app support assistant.
//
// POST /api/support/chat  { messages: [{ role: 'user'|'assistant', content }] }
//   → { reply, source: 'ai' | 'fallback' }
//
// Mirrors the OpenAI usage in /api/ai/generate-plan (same OPENAI_API_KEY /
// OPENAI_MODEL). The AI call is gated behind a signed-in session so anonymous
// traffic can't burn the key; signed-out users (and any AI failure) get the
// rule-based fallback. The assistant handles first-line questions and escalates
// to a human on the Shape team when it can't resolve something.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIOutputItem = { content?: OpenAIContentPart[] };
type OpenAIResponsePayload = { output_text?: string; output?: OpenAIOutputItem[] };

const SYSTEM_PROMPT = [
  'You are Nora, Shape\'s in-app support assistant. Introduce yourself as Nora if asked your name.',
  'Shape is a fitness and nutrition coaching app',
  'where members train, log meals/habits, track a Shape Score, and work with a real human coach.',
  'Help with first-line questions: account & login, billing/subscription, connecting integrations',
  '(Spotify, Strava, Whoop, Oura, Garmin, Apple Health, Instacart), using the Train/Eat/Habits/Score/Radio',
  'tabs, channels & chat, and working with coaches.',
  'Be warm, concise (1-4 sentences), and practical. Never invent policy, prices, or medical advice.',
  'If something needs a human — refunds, account changes, data deletion, a bug, or anything you are unsure about —',
  'say you have flagged it for the Shape team and they will follow up here. Do not promise specific timelines.',
].join(' ');

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

async function askOpenAI(messages: ChatMessage[]): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // Keep the last ~12 turns for context.
  const recent = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      input: [{ role: 'system', content: SYSTEM_PROMPT }, ...recent],
    }),
  });
  if (!response.ok) {
    console.warn('[shape-app] support chat OpenAI failed:', await response.text().catch(() => ''));
    return null;
  }
  const text = extractOutputText((await response.json()) as OpenAIResponsePayload);
  return text.trim() || null;
}

// Rule-based first responder for signed-out users or when the model is down.
function fallbackReply(text: string): string {
  const q = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  if (has('spotify')) return 'For Spotify: open Settings → Manage integrations → Connect Spotify. Once connected you can save a coach\'s playlist straight to your own profile. If it asks you to reconnect, that\'s just to grant the new save permission.';
  if (has('instacart', 'grocery')) return 'Grocery hand-off to Instacart is rolling out — for now your grocery list copies to your clipboard so you can paste it into any store. I\'ve noted your interest for the Shape team.';
  if (has('whoop', 'strava', 'oura', 'garmin', 'apple health', 'apple watch', 'wearable', 'sync')) return 'You can connect wearables under Settings → Manage integrations (Strava, Whoop, Oura, Garmin, and Apple Health on the iOS app). Recovery, sleep, and workouts then flow into your daily snapshot.';
  if (has('password', 'log in', 'login', 'sign in', 'can\'t get in', 'reset')) return 'For login trouble, try resetting your password from the sign-in screen. If you still can\'t get in, tell me your account email and I\'ll flag it for the Shape team to help.';
  if (has('cancel', 'refund', 'billing', 'charge', 'subscription', 'payment')) return 'I can\'t make billing changes from here, but I\'ve flagged this for the Shape team — they\'ll follow up in this thread. If you can, add the date and amount you\'re asking about.';
  if (has('coach', 'trainer', 'nutritionist')) return 'You can message your coach any time from Chat → Friends/Coaches, and find new coaches in the Marketplace. Want me to point you to anything specific?';
  return 'Thanks for reaching out — I\'ve passed this to the Shape team and they\'ll follow up right here. In the meantime, is there anything else I can help with?';
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { messages?: ChatMessage[] };
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && m.content) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return NextResponse.json({ error: 'No message provided.' }, { status: 400 });

  const user = await currentUser(request);
  if (user) {
    const reply = await askOpenAI(messages).catch(() => null);
    if (reply) return NextResponse.json({ reply, source: 'ai' });
  }
  return NextResponse.json({ reply: fallbackReply(String(lastUser.content || '')), source: 'fallback' });
}
