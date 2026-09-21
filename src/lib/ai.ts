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
// Chat Completions endpoint — keep it. DEFAULT_MODEL is the shipped default;
// OPENAI_MODEL overrides it per deployment (see aiModel()). Don't "downgrade"
// either to satisfy a stale model list.
//
// ⚠ THE DEFAULT IS GPT-6 ASTRA (2026-09-21), AND ASTRA CHANGES THE REQUEST SHAPE.
// Astra refuses the sampling parameters (`temperature`, `top_p`, `top_logprobs`)
// with a 400, and accepts `reasoning.effort` only from `low` upward — `none` and
// `minimal` are 400s as well. Nothing in this repo sends a sampling parameter
// today, but the next caller will, so prepareAIRequest() strips them for every
// reasoning-family model and clamps the effort — and a test proves both rather
// than trusting the callers. Tool calling with Astra is Responses-API-only,
// which is the endpoint above; Chat Completions would silently lose the tools.
//
// ⚠ ASTRA IS ACCESS-GATED ON SOME ACCOUNTS, and an account without access gets
// `model_not_found` for a model that exists. That is the ONE provider error
// callAI retries: once, on the fallback model, with a log line naming both —
// so Nora keeps answering while the operator sorts out access, and the log
// says which model actually answered. Any other 4xx/5xx is the caller's to
// handle, exactly as before.
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'gpt-6-astra';
// Where a request lands when the pinned model itself is refused. `none` in
// OPENAI_FALLBACK_MODEL disables the retry entirely.
const DEFAULT_FALLBACK_MODEL = 'gpt-5.4-mini';
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TIMEOUT_MS = 60_000;

export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type Verbosity = 'low' | 'medium' | 'high';
// `low` is the deployment default: Nora's chat is latency-bound and every route
// that wants more asks for it per call (opts.effort). OPENAI_REASONING_EFFORT
// moves the floor for the whole deployment without a code change.
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';
// Sampling knobs no reasoning-family model accepts (Astra 400s on them; the
// gpt-5 family accepts only their defaults, which is the same as not sending).
const SAMPLING_PARAMS = ['temperature', 'top_p', 'top_logprobs', 'logprobs'] as const;

export function aiModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

/** The model a refused pin falls back to, or null when the retry is disabled. */
export function aiFallbackModel(): string | null {
  const v = process.env.OPENAI_FALLBACK_MODEL;
  if (v === undefined || v === '') return DEFAULT_FALLBACK_MODEL;
  return /^(none|off|false|0)$/i.test(v.trim()) ? null : v.trim();
}

/**
 * The model for an UNAUTHENTICATED caller. /api/support/chat answers signed-out
 * visitors and Cook Mode cooks with no membership check, and Astra bills five
 * times the economy model per token — so the open door gets the economy model
 * unless OPENAI_PUBLIC_MODEL says otherwise, and members (whose facts and tools
 * are what Astra is for) get the pin. Defaults to the fallback model, else the
 * pin itself when the fallback is disabled.
 */
export function aiPublicModel(): string {
  return process.env.OPENAI_PUBLIC_MODEL || aiFallbackModel() || aiModel();
}

/**
 * Reasoning-family models take `reasoning.effort` and refuse the sampling
 * parameters; everything else (gpt-4.1, gpt-4o, the `-chat-latest` variants)
 * is the other way round. Decided from the model id because the env can pin
 * anything, and a 400 for a parameter the model does not know reads as
 * "the model is broken" rather than "we sent the wrong shape".
 */
export function isReasoningModel(model: string): boolean {
  const m = String(model || '').toLowerCase();
  if (/-chat-latest$/.test(m)) return false;
  return /^(gpt-5|gpt-6|o[1-9])/.test(m);
}

/** GPT-6 Astra's effort floor: `none`/`minimal` are refused, `low` is the first
 * accepted value. Other reasoning models accept the whole ladder. */
export function isAstraModel(model: string): boolean {
  return /^gpt-6/i.test(String(model || ''));
}

export function normalizeEffort(v: unknown): ReasoningEffort | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (REASONING_EFFORTS as readonly string[]).includes(s) ? (s as ReasoningEffort) : null;
}

/** The effort a request will carry: the caller's, else the deployment's, else `low`. */
export function aiReasoningEffort(): ReasoningEffort {
  return normalizeEffort(process.env.OPENAI_REASONING_EFFORT) || DEFAULT_REASONING_EFFORT;
}

/** Whether responses are retained by the provider (30 days) — off by default,
 * because Nora's prompts carry a member's health facts. OPENAI_STORE_RESPONSES=1
 * turns retention back on without a code change. */
export function aiStoreResponses(): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env.OPENAI_STORE_RESPONSES || ''));
}

/**
 * The exact request body a call sends, derived from what the caller asked for
 * and what the resolved model accepts. PURE — tests drive it directly.
 *
 *   • `model`: the caller's, else OPENAI_MODEL, else the default.
 *   • reasoning models: sampling params dropped; `reasoning.effort` set from
 *     the caller → env → `low`, clamped to Astra's floor; `text.verbosity`
 *     applied when asked. Non-reasoning models get none of these (each would
 *     be a 400 there), and keep whatever sampling params the caller sent.
 *   • `store`: false unless the caller says otherwise or the env re-enables
 *     retention. A stateless tool loop needs the model's reasoning back, so a
 *     reasoning model with tools also asks for `reasoning.encrypted_content`.
 *   • `prompt_cache_key`: the promptId, so a route's fixed prefix (prompt +
 *     tools) routes to the same cache — cached input is a tenth of the price.
 */
export function prepareAIRequest(
  body: Record<string, unknown>,
  opts: { promptId?: string; effort?: ReasoningEffort; verbosity?: Verbosity; model?: string } = {},
): { model: string; payload: Record<string, unknown> } {
  const model = (typeof opts.model === 'string' && opts.model) || (typeof body.model === 'string' && body.model ? body.model : aiModel());
  const payload: Record<string, unknown> = { ...body, model };
  if (payload.store === undefined) payload.store = aiStoreResponses();
  if (opts.promptId && payload.prompt_cache_key === undefined) payload.prompt_cache_key = opts.promptId;
  if (!isReasoningModel(model)) return { model, payload };

  for (const k of SAMPLING_PARAMS) delete payload[k];
  const bodyReasoning = body.reasoning && typeof body.reasoning === 'object' ? (body.reasoning as Record<string, unknown>) : {};
  let effort = normalizeEffort(bodyReasoning.effort) || normalizeEffort(opts.effort) || aiReasoningEffort();
  if (isAstraModel(model) && (effort === 'none' || effort === 'minimal')) effort = 'low';
  payload.reasoning = { ...bodyReasoning, effort };
  if (opts.verbosity) {
    const text = payload.text && typeof payload.text === 'object' ? (payload.text as Record<string, unknown>) : {};
    payload.text = { ...text, verbosity: opts.verbosity };
  }
  if (payload.store === false && Array.isArray(payload.tools) && payload.tools.length) {
    const include = Array.isArray(payload.include) ? (payload.include as unknown[]) : [];
    if (!include.includes('reasoning.encrypted_content')) payload.include = [...include, 'reasoning.encrypted_content'];
  }
  return { model, payload };
}

/**
 * The provider saying the MODEL is unavailable to this account — the one
 * failure worth a second attempt on another model. Read off the error body's
 * own `code`/`param`, with the message as the backstop; a generic 400 (our
 * request shape) or a 5xx (their outage) is deliberately NOT this.
 */
export function isModelAccessError(status: number, detail: string): boolean {
  if (![400, 403, 404].includes(status)) return false;
  let err: { code?: unknown; param?: unknown; message?: unknown } = {};
  try {
    const parsed = JSON.parse(detail || '') as { error?: unknown };
    if (parsed && typeof parsed.error === 'object' && parsed.error) err = parsed.error as typeof err;
  } catch {
    /* not JSON — fall through to the message test */
  }
  if (err.code === 'model_not_found') return true;
  if (err.param === 'model') return true;
  const msg = typeof err.message === 'string' ? err.message : String(detail || '');
  // Order-independent: "model X does not exist" and "no access to model X"
  // both name the model and a refusal. "not supported" is deliberately NOT a
  // refusal — "Unsupported parameter … with this model" is OUR request shape.
  return /\bmodel\b/i.test(msg) && /(not found|does not exist|not have access|no access|access denied|not available|unavailable)/i.test(msg);
}

/**
 * The model for a request carrying an `input_image` part.
 *
 * ⚠ VISION IS A SEPARATE CAPABILITY FROM TEXT, SO IT GETS ITS OWN PIN — the same
 * reason DEFAULT_TRANSCRIBE_MODEL and DEFAULT_TTS_MODEL exist rather than riding
 * OPENAI_MODEL. A model pinned for chat and plan generation need not accept
 * images at all, and when it does not the provider answers 4xx, which the photo
 * route can only report to the member as "we couldn't read your photo" — so the
 * feature is deployed, reachable, and dead on every single import, with nothing
 * on screen able to say why.
 *
 * ⚠ IT DEFAULTS TO `aiModel()`, SO THIS CHANGES NOTHING UNTIL THE VAR IS SET.
 * No guessed model name, and no "downgrade to satisfy a stale model list" of the
 * kind this file's header warns against: if the pinned model reads images it
 * goes on reading them. What the indirection buys is that a build whose model
 * cannot becomes a CONFIGURATION fix rather than a code change and a review
 * round.
 *
 * ⚠ IT IS NOT A ZERO-DEPLOY FIX, AND SAYING SO WOULD COST SOMEONE AN HOUR.
 * Vercel snapshots environment variables into a deployment at BUILD time, so
 * setting this in the dashboard does not reach the deployment already serving
 * traffic — it applies to the next one. The operator sets the variable AND
 * redeploys (a redeploy of the existing build is enough; no new commit). An
 * earlier draft of this comment promised "no deploy", which would have had
 * whoever followed it set the variable, retry, watch it fail identically, and
 * conclude the fix did not work.
 */
export function aiVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || aiModel();
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
  | { ok: true; data: unknown; usage: AIUsage | null; latencyMs: number; promptId: string; model: string; fellBack: boolean }
  | {
      ok: false;
      reason: 'no_key' | 'timeout' | 'http_error' | 'network';
      status?: number;
      detail?: string;
      latencyMs: number;
      promptId: string;
      model?: string;
    };

export type CallAIOptions = {
  promptId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Reasoning effort for this call (reasoning models only; default `low`). */
  effort?: ReasoningEffort;
  /** Prose length steering (reasoning models only) — `low` for a chat bubble. */
  verbosity?: Verbosity;
};

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
 * `body` is the Responses-API request body (minus `model`, which defaults to
 * OPENAI_MODEL when not supplied) — pass `input`, `tools`, `text.format`, etc.
 * prepareAIRequest() then shapes it for the model that will actually run it.
 *
 * ⚠ ONE retry, on ONE failure: the pinned model being unavailable to this
 * account (isModelAccessError). The fallback model is prepared from the same
 * body — its own effort clamp, its own sampling rules — and the result says
 * `fellBack: true` so a route can tell. A timeout, a network error, or any
 * other status returns as it always did.
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

  const first = prepareAIRequest(body, { promptId, effort: opts.effort, verbosity: opts.verbosity });
  const fallback = aiFallbackModel();
  const attempts: Array<{ model: string; payload: Record<string, unknown> }> = [first];
  // Only a refused PIN falls back: a caller who named a model explicitly asked
  // for exactly that one, and a failing fallback must never retry itself.
  const explicit = typeof body.model === 'string' && !!body.model;
  if (!explicit && fallback && fallback !== first.model) {
    attempts.push(prepareAIRequest({ ...body, model: fallback }, { promptId, effort: opts.effort, verbosity: opts.verbosity }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const started = Date.now();
  try {
    for (let i = 0; i < attempts.length; i++) {
      const { model, payload } = attempts[i];
      const fellBack = i > 0;
      const res = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const canFallBack = i + 1 < attempts.length && isModelAccessError(res.status, detail);
        logAI({ promptId, ok: false, reason: canFallBack ? 'model_fallback' : 'http_error', status: res.status, latencyMs, model, ...(canFallBack ? { fallbackModel: attempts[i + 1].model } : {}) });
        console.warn(`[shape-ai] ${promptId} OpenAI ${res.status} (${model}):`, detail.slice(0, 500));
        if (canFallBack) continue;
        return { ok: false, reason: 'http_error', status: res.status, detail, latencyMs, promptId, model };
      }
      const data = await res.json();
      const usage = readUsage(data);
      logAI({
        promptId,
        ok: true,
        latencyMs,
        model,
        fellBack,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      });
      return { ok: true, data, usage, latencyMs, promptId, model, fellBack };
    }
    // Unreachable: the loop returns on success and on its last failure.
    return { ok: false, reason: 'http_error', latencyMs: Date.now() - started, promptId };
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
