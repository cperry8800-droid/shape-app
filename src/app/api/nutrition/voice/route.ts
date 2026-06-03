// Voice meal logging: spoken description → transcript → a single food item
// with estimated macros.
//
// POST /api/nutrition/voice  (multipart/form-data, field "audio")
//   → { transcript, item: { name, kcal, p, c, f } | null }
//
// Transcribes with OpenAI audio transcription, then parses the text into a
// structured item with the same OPENAI_API_KEY / OPENAI_MODEL used elsewhere.
// Gated behind a signed-in session so anonymous traffic can't burn the key.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FoodItem = { name: string; kcal: number; p: number; c: number; f: number };

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIOutputItem = { content?: OpenAIContentPart[] };
type OpenAIResponsePayload = { output_text?: string; output?: OpenAIOutputItem[] };

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

async function transcribe(file: File, key: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    console.warn('[shape-app] voice transcription failed:', await res.text().catch(() => ''));
    throw new Error('transcription_failed');
  }
  const data = (await res.json()) as { text?: string };
  return String(data?.text || '').trim();
}

const PARSE_PROMPT = [
  'You convert a spoken meal description into ONE food/meal item with estimated macros for the described portion.',
  'Return ONLY a compact JSON object, no prose:',
  '{"name": string, "kcal": number, "p": number, "c": number, "f": number}.',
  'p = protein grams, c = carbohydrate grams, f = fat grams. Estimate sensible whole-number values.',
  'If the text is empty or not about food, return {"name":"","kcal":0,"p":0,"c":0,"f":0}.',
].join(' ');

function coerceItem(raw: unknown, fallbackName: string): FoodItem {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const name = String(j.name || '').trim().slice(0, 80) || fallbackName.slice(0, 80);
  return { name, kcal: num(j.kcal), p: num(j.p), c: num(j.c), f: num(j.f) };
}

async function parseFood(text: string, key: string): Promise<FoodItem> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      input: [{ role: 'system', content: PARSE_PROMPT }, { role: 'user', content: text.slice(0, 500) }],
    }),
  });
  if (!res.ok) return coerceItem(null, text);
  const out = extractOutputText((await res.json()) as OpenAIResponsePayload);
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) return coerceItem(null, text);
  try {
    return coerceItem(JSON.parse(match[0]), text);
  } catch {
    return coerceItem(null, text);
  }
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use voice logging.' }, { status: 401 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Voice logging is not configured.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No audio provided.' }, { status: 400 });

  try {
    const transcript = await transcribe(file, key);
    if (!transcript) return NextResponse.json({ transcript: '', item: null });
    const item = await parseFood(transcript, key);
    return NextResponse.json({ transcript, item: item.name ? item : null });
  } catch {
    return NextResponse.json({ error: 'Could not process the audio. Try again.' }, { status: 502 });
  }
}
