// Voice note dictation for the meal logger: a spoken meal note/review →
// transcript, which the client drops into the "note to your coach" field. The
// grocery list's "add by voice" rides the same route with context=grocery.
//
// POST /api/nutrition/voice  (multipart/form-data)  → { transcript, model, language }
//   audio     — the recording (required)
//   language  — the app's locale code ('de', 'pt-BR'); mapped to the ISO-639-1
//               hint the transcription takes, or left out so the model detects
//   context   — 'meal' (default) | 'grocery' | 'nora': which vocabulary primes
//               the transcription (src/lib/ai/voiceLang.mjs)
//
// Transcribes with OpenAI audio transcription via the shared AI helper (same
// OPENAI_API_KEY used elsewhere). Gated behind a signed-in session so anonymous
// traffic can't burn the key. (Audio "voice memo" recordings are kept
// client-side and ride along with the meal log — they are not sent here.)

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { transcribeAudio, hasOpenAIKey } from '@/lib/ai';
import { requireMembership } from '@/lib/require-membership';
import { transcriptionHints } from '@/lib/ai/voiceLang.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use voice notes.' }, { status: 401 });

  if (!hasOpenAIKey()) return NextResponse.json({ error: 'Voice notes are not configured.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No audio provided.' }, { status: 400 });
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI transcription hard limit
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio file too large.' }, { status: 413 });

  const hints = transcriptionHints(form, 'meal');
  const result = await transcribeAudio(file, { promptId: 'nutrition.voice', language: hints.language, prompt: hints.prompt, keywords: hints.keywords });
  if (!result.ok) return NextResponse.json({ error: 'Could not transcribe the audio. Try again.' }, { status: 502 });
  return NextResponse.json({ transcript: result.text, model: result.model, language: hints.language });
}
