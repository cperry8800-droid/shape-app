// Server wiring for the AI preview/confirm scaffold: resolve the acting human
// (auth + role), the registry of real actions, the user_goals-backed demo store,
// and the ai_audit_log sink (the SECURITY DEFINER RPCs from
// 2026-06-16-ai-audit-log.sql). The pure lifecycle lives in ./proposals.mjs;
// this file only injects concrete, RLS-scoped implementations.
//
// SERVER-ONLY. The Supabase client here is request-scoped (Bearer or cookie), so
// every read/write runs as the calling user and RLS stays authoritative.

import { createHash } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { currentUser, clientForRequest } from '@/lib/request-auth';
import { createRegistry, demoEchoAction } from '@/lib/ai/proposals.mjs';
import { NORA_ACTIONS } from '@/lib/ai/actions.mjs';

export type Actor = { user: User; role: string; supabase: SupabaseClient };

/** The signed-in human + their role + an RLS-scoped client, or null. */
export async function resolveActor(request: Request): Promise<Actor | null> {
  const user = await currentUser(request);
  if (!user) return null;
  const supabase = await clientForRequest(request);
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role || 'client';
  return { user, role, supabase };
}

/**
 * HMAC secret for proposal tokens — server-only, stable across instances.
 * Prefer a dedicated AI_PROPOSAL_SECRET. If it's unset we DON'T sign with the
 * raw service-role key (a leaked token could expose it); instead we derive a
 * one-way key from it via SHA-256, so the service key can never be recovered
 * from a token. Returns '' only when neither env is configured.
 */
export function proposalSecret(): string {
  const dedicated = process.env.AI_PROPOSAL_SECRET;
  if (dedicated) return dedicated;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return '';
  return createHash('sha256').update(`shape-ai-proposal:${serviceKey}`).digest('hex');
}

// The server's action registry. Real product actions (set goals, log meal,
// adjust program, …) get registered here in later prompts; today only the
// reversible demo action exists so the scaffold is exercisable end to end.
export const serverRegistry = createRegistry();
serverRegistry.define(demoEchoAction.name, demoEchoAction);
// Real action tools, registered in rollout order (TIER 1 → TIER 2).
for (const a of NORA_ACTIONS) serverRegistry.define(a.name, a);

/** Per-user key/value store backed by the caller's own user_goals rows. */
export function userGoalsStore(supabase: SupabaseClient, userId: string) {
  return {
    async get(key: string): Promise<unknown> {
      const { data } = await supabase
        .from('user_goals')
        .select('data')
        .eq('user_id', userId)
        .eq('kind', key)
        .maybeSingle();
      const blob = (data as { data?: unknown } | null)?.data;
      return blob && typeof blob === 'object' && Object.keys(blob as object).length ? blob : null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      await supabase
        .from('user_goals')
        .upsert({ user_id: userId, kind: key, data: value ?? {} }, { onConflict: 'user_id,kind' });
      return value;
    },
  };
}

/**
 * Compare-and-set write on a user_goals `{rev, …}` doc: re-read → mutate →
 * UPDATE conditioned on the stored rev (writing rev+1); zero affected rows =
 * a concurrent writer won → re-read and retry (×2), then surface 'conflict'.
 * First-row bootstrap: no row → INSERT rev 1; a (user_id, kind) unique
 * conflict is treated exactly like a CAS miss. `mutate(doc)` returns
 * `{ doc }` to write, or `{ error, candidates? }` to abort (validation).
 */
export async function casWriteUserGoals(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  mutate: (doc: unknown) => Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; candidates?: unknown }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error: readError } = await supabase
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', kind)
      .maybeSingle();
    // Only genuine CAS misses retry — a read failure (RLS, network, schema) is
    // a hard error, not a concurrent write, and must surface as itself.
    if (readError) return { ok: false, error: 'read_failed' };
    const existing = (data as { data?: unknown } | null)?.data ?? null;
    const out = mutate(existing);
    if (out && out.error) return { ok: false, error: String(out.error), candidates: (out as { candidates?: unknown }).candidates };
    const doc = (out as { doc?: Record<string, unknown> }).doc;
    if (!doc) return { ok: false, error: 'bad_mutation' };
    const rev = existing && typeof existing === 'object' && Number.isInteger((existing as { rev?: unknown }).rev)
      ? ((existing as { rev: number }).rev)
      : null;
    const nextDoc = { ...doc, rev: (rev ?? 0) + 1 };
    if (existing == null) {
      const { error } = await supabase.from('user_goals').insert({ user_id: userId, kind, data: nextDoc });
      if (!error) return { ok: true };
      // ONLY the (user_id, kind) unique violation is a concurrent first write
      // (a CAS miss) — anything else is a hard failure.
      if ((error as { code?: string }).code === '23505') continue;
      return { ok: false, error: 'write_failed' };
    }
    let q = supabase.from('user_goals').update({ data: nextDoc }).eq('user_id', userId).eq('kind', kind);
    q = rev == null ? q.is('data->>rev', null) : q.eq('data->>rev', String(rev));
    const { data: upd, error } = await q.select('user_id');
    if (error) return { ok: false, error: 'write_failed' };
    if (Array.isArray(upd) && upd.length > 0) return { ok: true };
    // zero rows = a concurrent writer won — re-read and retry.
  }
  return { ok: false, error: 'conflict' };
}

type AuditEntry = {
  actorUserId: string;
  actorRole: string;
  source: string;
  action: string;
  target?: { userId?: string | null; kind?: string | null; id?: string | null } | null;
  suggestion?: unknown;
  confirmedPayload?: unknown;
  beforeState?: unknown;
  afterState?: unknown;
  reversal?: unknown;
};

/** ai_audit_log sink: append/read/undo via the SECURITY DEFINER RPCs + RLS read. */
export function auditSink(supabase: SupabaseClient) {
  return {
    async log(entry: AuditEntry): Promise<string> {
      const { data, error } = await supabase.rpc('log_ai_action', {
        p_source: entry.source,
        p_action: entry.action,
        p_actor_role: entry.actorRole,
        p_target_user_id: entry.target?.userId ?? null,
        p_target_kind: entry.target?.kind ?? null,
        p_target_id: entry.target?.id ?? null,
        p_suggestion: entry.suggestion ?? null,
        p_confirmed_payload: entry.confirmedPayload ?? null,
        p_before_state: entry.beforeState ?? null,
        p_after_state: entry.afterState ?? null,
        p_reversal: entry.reversal ?? null,
      });
      if (error) throw new Error(`ai_audit_log write failed: ${error.message}`);
      return data as string;
    },
    async get(id: string) {
      const { data } = await supabase.from('ai_audit_log').select('*').eq('id', id).maybeSingle();
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        id: r.id,
        status: r.status,
        actorUserId: r.actor_user_id,
        actorRole: r.actor_role,
        source: r.source,
        action: r.action,
        target: { userId: r.target_user_id, kind: r.target_kind, id: r.target_id },
        suggestion: r.suggestion,
        confirmedPayload: r.confirmed_payload,
        beforeState: r.before_state,
        afterState: r.after_state,
        reversal: r.reversal,
      };
    },
    async markUndone(id: string): Promise<boolean> {
      const { error } = await supabase.rpc('mark_ai_action_undone', { p_id: id });
      if (error) throw new Error(`ai_audit undo failed: ${error.message}`);
      return true;
    },
  };
}

/** Single-use proposal-token reservation, backed by ai_proposal_nonces. consume
 * returns true the first time a nonce is confirmed (false on a replay); release
 * frees it so a failed execute can be retried with the same draft. */
export function proposalConsumer(supabase: SupabaseClient) {
  return {
    async consume(nonce: string): Promise<boolean> {
      const { data, error } = await supabase.rpc('consume_ai_proposal', { p_nonce: nonce });
      if (error) throw new Error(`proposal consume failed: ${error.message}`);
      return data === true;
    },
    async release(nonce: string): Promise<void> {
      await supabase.rpc('release_ai_proposal', { p_nonce: nonce });
    },
  };
}

/** The execution context passed to actions (actor identity + the RLS store + an
 * endpoint caller that forwards the actor's session). */
export function makeCtx(actor: Actor, request?: Request) {
  return {
    actor: { id: actor.user.id, role: actor.role },
    store: userGoalsStore(actor.supabase, actor.user.id),
    supabase: actor.supabase,
    // Call an existing same-origin /api/* endpoint CARRYING THE ACTOR'S SESSION,
    // so the endpoint's own auth + RLS stay the authoritative gate (never
    // service-role, never a bypass).
    async call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
      if (!request) throw new Error('endpoint call has no request context');
      const url = new URL(path, request.url);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const cookie = request.headers.get('cookie');
      if (cookie) headers.cookie = cookie;
      const auth = request.headers.get('authorization');
      if (auth) headers.authorization = auth;
      const res = await fetch(url, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    },
  };
}
