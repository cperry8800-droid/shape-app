// Nora's daily question limits and the visitor's bot check (owner, 2026-10-07: "Limits:
// visitors 20, signed in without a plan 40, members 200, coaches 300", none for admins,
// and "an invisible bot check on a visitor's first question, the same Turnstile the
// consult booking uses").
//
// WHY. The ✦ is on every public page now, and a visitor's question is a model call
// Shape pays for. The proxy's 100-a-minute limit stops a burst, not a script that asks
// all day. These limits are per account, or for a visitor per browser AND per address:
// the browser is a signed cookie the bot check issues, and the address cap stops a
// script that throws its cookie away from starting fresh on every question.
//
// The counters are the shared fixed-window limiter (check_rate_limit, HMAC-keyed), a
// day long. Like it, they fail OPEN: a limiter fault never takes Nora down.

import { checkRateLimit } from '@/lib/rate-limit';
import { turnstileEnabled, verifyTurnstile } from '@/lib/turnstile';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NoraTier = 'admin' | 'coach' | 'member' | 'account' | 'visitor';

/** Questions a day. null is no limit. */
export const NORA_DAILY: Record<NoraTier, number | null> = {
  visitor: 20,
  account: 40,
  member: 200,
  coach: 300,
  admin: null,
};
/** A visitor's address, whatever browser asks: five visitors' worth, so an office or a
 *  household sharing one address is not cut off by one person's twenty. */
export const VISITOR_ADDRESS_DAILY = 100;
const DAY = 86400;

// ── The model calls a signed-in account can make a day, beyond Nora's questions ─────────
// M8 of the 2026-10-08 review: ai/speak (2,000 characters a call), ai/transcribe (25 MB a
// call) and ai/draft-program (a structured-output program) were member-gated with no daily
// budget, so the proxy's 100-a-minute limit was the only bound on what one account could
// spend of the server's key. These are per-account, a day long, generous enough that a person
// never meets them (a heavy day of voice is tens of calls) and small enough that a script does.
// Like the question limits they fail OPEN: a limiter fault never takes a feature down.
export type AiBudgetKind = 'speak' | 'transcribe' | 'draft_program';
export const AI_DAILY_BUDGETS: Record<AiBudgetKind, number> = {
  speak: 200,
  transcribe: 300,
  draft_program: 40,
};

/** Count one call against the account's daily budget for `kind`. allowed:false once spent. */
export async function countBudget(
  sb: SupabaseClient | null,
  uid: string,
  kind: AiBudgetKind
): Promise<{ allowed: boolean; limit: number; resetSeconds: number }> {
  const limit = AI_DAILY_BUDGETS[kind];
  if (!sb || !uid) return { allowed: true, limit, resetSeconds: 0 };
  const r = await checkRateLimit(sb, `nora:${kind}:${uid}`, limit, DAY);
  return { allowed: r.allowed, limit, resetSeconds: r.resetSeconds };
}

/** What a route says when the day's budget is spent. */
export function budgetReply(kind: AiBudgetKind, resetSeconds: number): string {
  const hours = Math.max(1, Math.ceil(resetSeconds / 3600));
  const when = `in about ${hours} hour${hours === 1 ? '' : 's'}`;
  const what = kind === 'speak' ? "Nora's voice" : kind === 'transcribe' ? 'voice input' : 'AI drafting';
  return `That's today's limit for ${what}. It resets ${when}.`;
}

/** Who is asking, from the server's own verdicts (never the page's claim). */
export function noraTier(signedIn: boolean, m: { isMember?: boolean; isCoach?: boolean; isAdmin?: boolean } | null): NoraTier {
  if (!signedIn) return 'visitor';
  if (m && m.isAdmin) return 'admin';
  if (m && m.isCoach) return 'coach';
  if (m && m.isMember) return 'member';
  return 'account';
}

// ── The visitor's browser: a signed id in a cookie ──────────────────────────────
export const VISITOR_COOKIE = 'shape_nora_v';
const ID_RE = /^[0-9a-f-]{36}$/i;

function secret(): string {
  return process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}
async function mac(id: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`nora-visitor:${id}`)));
  let hex = '';
  for (const b of sig) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** `<id>.<mac>`. With no server secret (a local build) the id rides unsigned. */
export async function signVisitor(id: string): Promise<string> {
  return secret() ? `${id}.${await mac(id)}` : id;
}

/** The visitor id a cookie value proves, or null for a missing, malformed or forged one. */
export async function readVisitor(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const [id, sig] = String(value).split('.');
  if (!id || !ID_RE.test(id)) return null;
  if (!secret()) return id;
  if (!sig) return null;
  const want = await mac(id);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? id : null;
}

export function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function visitorCookieHeader(signed: string): string {
  return `${VISITOR_COOKIE}=${encodeURIComponent(signed)}; Path=/api/support; Max-Age=${30 * DAY}; HttpOnly; Secure; SameSite=Lax`;
}

export function requestIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * The visitor's browser for this question. A browser with a valid cookie passes. One
 * without needs the bot check when it is switched on (TURNSTILE_SECRET_KEY): a solved
 * token earns a fresh id and the cookie that carries it, so only the first question
 * is checked. With the check off, a fresh id is issued with no check.
 */
export async function visitorGate(request: Request, token: unknown): Promise<
  { ok: true; id: string; setCookie: string | null } | { ok: false }
> {
  const known = await readVisitor(cookieValue(request, VISITOR_COOKIE));
  if (known) return { ok: true, id: known, setCookie: null };
  if (turnstileEnabled()) {
    const ip = requestIp(request);
    if (!(await verifyTurnstile(token, ip === 'unknown' ? null : ip))) return { ok: false };
  }
  const id = crypto.randomUUID();
  return { ok: true, id, setCookie: visitorCookieHeader(await signVisitor(id)) };
}

/** Count this question. allowed:false once today's limit is spent. */
export async function countQuestion(
  sb: SupabaseClient | null,
  who: { tier: NoraTier; uid?: string | null; visitorId?: string | null; ip?: string | null }
): Promise<{ allowed: boolean; limit: number | null; resetSeconds: number }> {
  const limit = NORA_DAILY[who.tier];
  if (limit == null || !sb) return { allowed: true, limit, resetSeconds: 0 };
  if (who.tier === 'visitor') {
    const browser = await checkRateLimit(sb, `nora:v:${who.visitorId || 'none'}`, limit, DAY);
    if (!browser.allowed) return { allowed: false, limit, resetSeconds: browser.resetSeconds };
    const address = await checkRateLimit(sb, `nora:ip:${who.ip || 'unknown'}`, VISITOR_ADDRESS_DAILY, DAY);
    return { allowed: address.allowed, limit, resetSeconds: address.resetSeconds };
  }
  const r = await checkRateLimit(sb, `nora:u:${who.uid}`, limit, DAY);
  return { allowed: r.allowed, limit, resetSeconds: r.resetSeconds };
}

/** What Nora says when today's questions are spent: plain, and where the next one comes from. */
export function limitReply(tier: NoraTier, limit: number | null, resetSeconds: number): string {
  const hours = Math.max(1, Math.ceil(resetSeconds / 3600));
  const when = `in about ${hours} hour${hours === 1 ? '' : 's'}`;
  if (tier === 'visitor') {
    return `That's today's ${limit} questions for visitors. Sign in or create an account to keep asking, or come back ${when}. For anything urgent, email info@theshapecommunity.com.`;
  }
  return `You've reached today's limit of ${limit} questions for Nora. It resets ${when}. For anything urgent, email info@theshapecommunity.com.`;
}

export const CHECK_REPLY = "One quick check that you're a person, then I'll answer. If it keeps failing, reload the page.";
