// Shared server-side OpenAI access for Shape.
//
// ONE place that holds the key, the model default, a request timeout, error
// handling, and structured logging (prompt id, latency, tokens). Every AI route
// (generate-plan, weekly-readout, support/chat, voice) goes through here instead
// of reimplementing the fetch. The route keeps its own request body + response
// parsing, so migrating onto this helper is behaviour-preserving.
//
// SERVER-ONLY: reads OPENAI_API_KEY / OPENAI_MODEL. Never import from the
// client/mobile bundle — the key must never reach the browser.

// NOTE: this is the OpenAI **Responses API** (`/v1/responses`), not the legacy
// Chat Completions endpoint — keep it. DEFAULT_MODEL is only a fallback; prod
// pins the model via OPENAI_MODEL (see aiModel()). Don't "downgrade" either to
// satisfy a stale model list.
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TIMEOUT_MS = 60_000;

export function aiModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export type AIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type CallAIResult =
  | { ok: true; data: unknown; usage: AIUsage | null; latencyMs: number; promptId: string }
  | {
      ok: false;
      reason: 'no_key' | 'timeout' | 'http_error' | 'network';
      status?: number;
      detail?: string;
      latencyMs: number;
      promptId: string;
    };

export type CallAIOptions = { promptId: string; timeoutMs?: number; signal?: AbortSignal };

function readUsage(data: unknown): AIUsage | null {
  const u = data && typeof data === 'object' ? (data as { usage?: unknown }).usage : null;
  if (!u || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  const num = (...vals: unknown[]): number | null => {
    for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
    return null;
  };
  return {
    inputTokens: num(o.input_tokens, o.prompt_tokens),
    outputTokens: num(o.output_tokens, o.completion_tokens),
    totalTokens: num(o.total_tokens),
  };
}

// One structured line per AI call so latency/tokens/errors are greppable.
// Logging must never throw.
function logAI(line: Record<string, unknown>): void {
  try {
    console.log('[shape-ai]', JSON.stringify(line));
  } catch {
    /* never throw from logging */
  }
}

/**
 * Call the OpenAI Responses API with the shared key/model, a timeout, error
 * handling, and structured logging. Returns a discriminated result — callers
 * map `ok:false` (including `no_key`) to their existing fallback path, exactly
 * as the inlined `if (!key) return null` / `if (!response.ok) return null`
 * checks did before.
 *
 * `body` is the exact Responses-API request body (minus `model`, which defaults
 * to OPENAI_MODEL when not supplied) — pass `input`, `tools`, `text.format`, etc.
 */
export async function callAI(
  body: Record<string, unknown>,
  opts: CallAIOptions,
): Promise<CallAIResult> {
  const { promptId } = opts;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    logAI({ promptId, ok: false, reason: 'no_key' });
    return { ok: false, reason: 'no_key', latencyMs: 0, promptId };
  }

  const model = typeof body.model === 'string' && body.model ? body.model : aiModel();
  const payload = { ...body, model };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const started = Date.now();
  try {
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logAI({ promptId, ok: false, reason: 'http_error', status: res.status, latencyMs, model });
      console.warn(`[shape-ai] ${promptId} OpenAI ${res.status}:`, detail.slice(0, 500));
      return { ok: false, reason: 'http_error', status: res.status, detail, latencyMs, promptId };
    }
    const data = await res.json();
    const usage = readUsage(data);
    logAI({
      promptId,
      ok: true,
      latencyMs,
      model,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    });
    return { ok: true, data, usage, latencyMs, promptId };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'network';
    logAI({ promptId, ok: false, reason, latencyMs });
    return { ok: false, reason, detail: String((err as Error)?.message || err), latencyMs, promptId };
  } finally {
    clearTimeout(timer);
  }
}

export type TranscribeResult =
  | { ok: true; text: string; latencyMs: number; promptId: string }
  | {
      ok: false;
      reason: 'no_key' | 'timeout' | 'http_error' | 'network';
      status?: number;
      latencyMs: number;
      promptId: string;
    };

/**
 * Transcribe audio with the OpenAI audio-transcription API (Whisper), using the
 * same key + timeout + logging discipline as callAI. Separate from callAI
 * because it targets the multipart transcription endpoint, not /v1/responses.
 */
export async function transcribeAudio(
  file: File,
  opts: { promptId: string; timeoutMs?: number },
): Promise<TranscribeResult> {
  const { promptId } = opts;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    logAI({ promptId, ok: false, reason: 'no_key' });
    return { ok: false, reason: 'no_key', latencyMs: 0, promptId };
  }

  const form = new FormData();
  form.append('file', file, file.name || 'note.webm');
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logAI({ promptId, ok: false, reason: 'http_error', status: res.status, latencyMs });
      console.warn(`[shape-ai] ${promptId} transcription ${res.status}:`, detail.slice(0, 300));
      return { ok: false, reason: 'http_error', status: res.status, latencyMs, promptId };
    }
    const data = (await res.json()) as { text?: string };
    logAI({ promptId, ok: true, latencyMs });
    return { ok: true, text: String(data?.text || '').trim(), latencyMs, promptId };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'network';
    logAI({ promptId, ok: false, reason, latencyMs });
    return { ok: false, reason, latencyMs, promptId };
  } finally {
    clearTimeout(timer);
  }
}

export type SpeechFormat = 'mp3' | 'opus' | 'aac' | 'wav';
export type SynthesizeResult =
  | { ok: true; audio: Buffer; contentType: string; latencyMs: number; promptId: string }
  | {
      ok: false;
      reason: 'no_key' | 'timeout' | 'http_error' | 'network';
      status?: number;
      latencyMs: number;
      promptId: string;
    };

const SPEECH_CONTENT_TYPE: Record<SpeechFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

/**
 * Synthesize speech from text with the OpenAI TTS API, same key + timeout +
 * logging discipline as callAI. The route hands us text VERBATIM (the caller
 * owns text↔speech parity); we only pick the voice. Returns audio bytes.
 */
export async function synthesizeSpeech(
  text: string,
  opts: { promptId: string; voice?: string; format?: SpeechFormat; timeoutMs?: number; instructions?: string },
): Promise<SynthesizeResult> {
  const { promptId } = opts;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    logAI({ promptId, ok: false, reason: 'no_key' });
    return { ok: false, reason: 'no_key', latencyMs: 0, promptId };
  }
  const format: SpeechFormat = opts.format || 'mp3';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
        voice: opts.voice || 'shimmer',
        input: text,
        response_format: format,
        // Delivery steering only (gpt-4o-mini-tts). The input text is verbatim.
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logAI({ promptId, ok: false, reason: 'http_error', status: res.status, latencyMs });
      console.warn(`[shape-ai] ${promptId} tts ${res.status}:`, detail.slice(0, 300));
      return { ok: false, reason: 'http_error', status: res.status, latencyMs, promptId };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    logAI({ promptId, ok: true, latencyMs });
    return { ok: true, audio, contentType: SPEECH_CONTENT_TYPE[format], latencyMs, promptId };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'network';
    logAI({ promptId, ok: false, reason, latencyMs });
    return { ok: false, reason, latencyMs, promptId };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse strict JSON emitted by a model into a value, returning null on anything
 * malformed. Model output that becomes DATA must go through this (or a stricter
 * validator) — never write raw model text straight to the record.
 */
export function parseModelJson<T = unknown>(text: string): T | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// The directive engine ("one lead per page") lives in ./ai/directive — reachable
// via @/lib/ai per the AI-server convention.
export {
  computeDirective,
  engineDirective,
  readOverride,
  writeOverride,
  sanitizeOverride,
  invalidateDirectiveCache,
  type Directive,
} from './ai/directive';

// AI message drafting (grounded, cross-discipline) lives in ./ai/draft.
export { draftCheckin, type CheckinDraft } from './ai/draft';
