// Voice note dictation for the meal logger: a spoken meal note/review →
// transcript, which the client drops into the "note to your coach" field.
//
// POST /api/nutrition/voice  (multipart/form-data, field "audio")  → { transcript }
//
// Transcribes with OpenAI audio transcription via the shared AI helper (same
// OPENAI_API_KEY used elsewhere). Gated behind a signed-in session so anonymous
// traffic can't burn the key. (Audio "voice memo" recordings are kept
// client-side and ride along with the meal log — they are not sent here.)

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { transcribeAudio, hasOpenAIKey } from '@/lib/ai';
import { requireMembership } from '@/lib/require-membership';

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

  const result = await transcribeAudio(file, { promptId: 'nutrition.voice' });
  if (!result.ok) return NextResponse.json({ error: 'Could not transcribe the audio. Try again.' }, { status: 502 });
  return NextResponse.json({ transcript: result.text });
}
