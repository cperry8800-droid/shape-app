// Nora's voice — server-side TTS. Speaks a piece of text back as audio. The
// route synthesizes the text VERBATIM (it never rewrites the words), and echoes
// the exact spoken string in the X-Spoken-Text header — so a caller can assert
// what-was-heard === what-was-shown (text↔speech parity). The `tone` only
// selects the VOICE; it does not change a single word.
//
// POST { text, tone? } -> audio/mpeg  (+ X-Spoken-Text: <urlencoded text>)
// Voice is opt-in and degrades cleanly: 503 when no key is configured, so the
// app is fully usable without audio. Behind the membership gate (/api/ai/*).

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor } from '@/lib/ai/server';
import { hasOpenAIKey, synthesizeSpeech } from '@/lib/ai';
import { resolveVoice, voiceStyleForTone, encodeSpokenText, SPOKEN_TEXT_HEADER } from '@/lib/ai/tone.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TTS_CHARS = 2000;

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ text?: string; tone?: string; voice?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const text = String(parsed.data.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Nothing to speak.' }, { status: 400 });
  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json({ error: 'That is too long to read aloud.' }, { status: 413 });
  }
  // Opt-in feature: if voice isn't configured, say so cleanly — the caller falls
  // back to on-device speech (or just shows the text).
  if (!hasOpenAIKey()) return NextResponse.json({ error: 'Voice is unavailable.' }, { status: 503 });

  // The member's explicit voice choice, else the tone's default voice.
  const voice = resolveVoice(parsed.data.voice, parsed.data.tone);
  // Delivery steering only — the words are synthesized verbatim (the parity
  // header is untouched). The env override wins so the owner can pin a house
  // style; unset, the per-tone default applies.
  const instructions = (process.env.NORA_TTS_INSTRUCTIONS || '').trim() || voiceStyleForTone(parsed.data.tone);
  const res = await synthesizeSpeech(text, { voice, instructions, promptId: 'nora.speak' });
  if (!res.ok) {
    const status = res.reason === 'no_key' ? 503 : 502;
    return NextResponse.json({ error: 'Could not read that aloud right now.' }, { status });
  }

  return new NextResponse(new Uint8Array(res.audio), {
    status: 200,
    headers: {
      'Content-Type': res.contentType,
      'Content-Length': String(res.audio.byteLength),
      // Parity: the exact text that was spoken, verbatim.
      [SPOKEN_TEXT_HEADER]: encodeSpokenText(text),
      'Cache-Control': 'no-store',
    },
  });
}
