// Voice note dictation for the meal logger: a spoken meal note/review →
// transcript, which the client drops into the "note to your coach" field.
//
// POST /api/nutrition/voice  (multipart/form-data, field "audio")  → { transcript }
//
// Transcribes with OpenAI audio transcription using the same OPENAI_API_KEY
// used elsewhere. Gated behind a signed-in session so anonymous traffic can't
// burn the key. (Audio "voice memo" recordings are kept client-side and ride
// along with the meal log — they are not sent here.)

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function transcribe(file: File, key: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, file.name || 'note.webm');
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    console.warn('[shape-app] voice note transcription failed:', await res.text().catch(() => ''));
    throw new Error('transcription_failed');
  }
  const data = (await res.json()) as { text?: string };
  return String(data?.text || '').trim();
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use voice notes.' }, { status: 401 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Voice notes are not configured.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No audio provided.' }, { status: 400 });

  try {
    const transcript = await transcribe(file, key);
    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json({ error: 'Could not transcribe the audio. Try again.' }, { status: 502 });
  }
}
