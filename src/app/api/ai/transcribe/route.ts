// Server-side speech-to-text for Nora's voice input (the fallback path when the
// browser's Web Speech API isn't available — e.g. Firefox / some mobile WebViews).
// Web is the fast path; this keeps the OpenAI key server-side, same rule as the
// LLM. Transcribe only — it returns text that the client drops into Nora's
// existing composer + send, so the downstream pipeline is unchanged.
//
// POST /api/ai/transcribe  (multipart/form-data, field "audio") → { transcript }
//
// Behind the /api/ai membership gate + a signed-in session (defense in depth, so
// the OpenAI key is never burned by anonymous traffic).

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
  if (!user) return NextResponse.json({ error: 'Sign in to use voice input.' }, { status: 401 });

  if (!hasOpenAIKey()) return NextResponse.json({ error: 'Voice input is not configured.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No audio provided.' }, { status: 400 });
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI transcription hard limit
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio file too large.' }, { status: 413 });

  const result = await transcribeAudio(file, { promptId: 'ai.transcribe' });
  if (!result.ok) return NextResponse.json({ error: 'Could not transcribe the audio. Try again.' }, { status: 502 });
  return NextResponse.json({ transcript: result.text });
}
