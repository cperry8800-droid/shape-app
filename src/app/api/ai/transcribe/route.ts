// Server-side speech-to-text for Nora's voice input (the fallback path when the
// browser's Web Speech API isn't available — e.g. Firefox / some mobile WebViews,
// and the NATIVE app, whose WebView has no dictation at all).
// Web is the fast path; this keeps the OpenAI key server-side, same rule as the
// LLM. Transcribe only — it returns text that the client drops into Nora's
// existing composer + send, so the downstream pipeline is unchanged.
//
// POST /api/ai/transcribe  (multipart/form-data)  → { transcript, model, language }
//   audio     — the recording (required)
//   language  — the app's locale code ('de', 'pt-BR'); mapped to the ISO-639-1
//               hint the transcription takes, or left out so the model detects
//   context   — 'nora' (default) | 'meal' | 'grocery': which vocabulary primes
//               the transcription (src/lib/ai/voiceLang.mjs)
//
// Behind the /api/ai membership gate + a signed-in session (defense in depth, so
// the OpenAI key is never burned by anonymous traffic).

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
  if (!user) return NextResponse.json({ error: 'Sign in to use voice input.' }, { status: 401 });

  if (!hasOpenAIKey()) return NextResponse.json({ error: 'Voice input is not configured.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No audio provided.' }, { status: 400 });
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI transcription hard limit
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio file too large.' }, { status: 413 });

  // The recording's language and Shape's own vocabulary ride with the audio —
  // a general model hears "Shape Score" as "shape's core" and dictates every
  // locale as English without them. Bad or missing hints fall to detection.
  const hints = transcriptionHints(form, 'nora');
  const result = await transcribeAudio(file, { promptId: 'ai.transcribe', language: hints.language, prompt: hints.prompt, keywords: hints.keywords });
  if (!result.ok) return NextResponse.json({ error: 'Could not transcribe the audio. Try again.' }, { status: 502 });
  return NextResponse.json({ transcript: result.text, model: result.model, language: hints.language });
}
